// Step 5 (SPEC §15.3): integrate movement and knockback, soft separation between units (they never
// hard-block each other, §15.5), then structure collision: the Citadel, blocked tiles, towers and walls
// are solid squares. Players stay on the map; enemies may stand outside it until they walk in.
import type { FullState } from './state';
import type { Unit } from './types';

const DT = 1 / 60;
const KNOCK_STOP = 0.05;

/** Rebuilds the spatial hash: living, present players; soldiers; enemies. */
export function rebuildSpatial(s: FullState): void {
  const w = s.world;
  const h = w.spatial;
  h.clear();
  for (const p of w.players) if (p.respawnAt === null && p.connected) h.insert(p.id, p.x, p.y, p.r);
  for (const u of w.soldiers) if (u.hp > 0) h.insert(u.id, u.x, u.y, u.r);
  for (const e of w.enemies) if (e.hp > 0) h.insert(e.id, e.x, e.y, e.r);
}

// Reused per-step buffers.
const bodies: Unit[] = [];
let pushX = new Float64Array(256);
let pushY = new Float64Array(256);
const index = new Map<number, number>();

function integrate(u: Unit, decay: number) {
  let vx = u.vx;
  let vy = u.vy;
  const k = u.push;
  if (k) {
    vx += k.x;
    vy += k.y;
    k.x *= decay;
    k.y *= decay;
    if (Math.abs(k.x) + Math.abs(k.y) < KNOCK_STOP) u.push = null;
  }
  u.x += vx * DT;
  u.y += vy * DT;
}

export function stepMovement(s: FullState): void {
  const w = s.world;
  const decay = s.cat.rules.knockbackDecay;
  bodies.length = 0;
  for (const p of w.players) {
    if (p.respawnAt !== null || !p.connected) continue;
    integrate(p, decay);
    bodies.push(p);
  }
  for (const u of w.soldiers) {
    if (u.hp <= 0) continue;
    integrate(u, decay);
    bodies.push(u);
  }
  for (const e of w.enemies) {
    if (e.hp <= 0) continue;
    integrate(e, decay);
    if (!e.flying) bodies.push(e);
  }

  rebuildSpatial(s);
  separate(s);
  for (const u of bodies) collide(s, u, s.kinds.get(u.id) === 'player');
  for (const e of w.enemies) if (e.flying) collide(s, e, false);
}

/** Jacobi soft separation: each overlapping pair is pushed apart by a fraction of the overlap. */
function separate(s: FullState) {
  const n = bodies.length;
  if (pushX.length < n) {
    pushX = new Float64Array(n * 2);
    pushY = new Float64Array(n * 2);
  }
  pushX.fill(0, 0, n);
  pushY.fill(0, 0, n);
  index.clear();
  for (let i = 0; i < n; i++) index.set(bodies[i]!.id, i);
  const k = s.cat.rules.separation * 0.5;
  const out = s.scratch;
  for (let i = 0; i < n; i++) {
    const a = bodies[i]!;
    s.world.spatial.query(a.x, a.y, a.r + 0.6, out);
    for (const id of out) {
      if (id <= a.id) continue;
      const j = index.get(id);
      if (j === undefined) continue;
      const b = bodies[j]!;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const rr = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-9) {
        // Exactly stacked: split along x, lower id to the left.
        dx = 1;
        dy = 0;
        d = 1;
      } else {
        dx /= d;
        dy /= d;
      }
      const overlap = (rr - Math.min(d, rr)) * k;
      pushX[i] = pushX[i]! - dx * overlap;
      pushY[i] = pushY[i]! - dy * overlap;
      pushX[j] = pushX[j]! + dx * overlap;
      pushY[j] = pushY[j]! + dy * overlap;
    }
  }
  for (let i = 0; i < n; i++) {
    bodies[i]!.x += pushX[i]!;
    bodies[i]!.y += pushY[i]!;
  }
}

/** Pushes a circle out of solid tiles; players are also kept on the map. */
function collide(s: FullState, u: Unit, isPlayer: boolean) {
  const { cols, rows, kinds, occupant } = s.world.grid;
  if (isPlayer) {
    u.x = Math.min(cols - u.r, Math.max(u.r, u.x));
    u.y = Math.min(rows - u.r, Math.max(u.r, u.y));
  }
  const flying = (u as { flying?: boolean }).flying === true;
  const c0 = Math.floor(u.x - u.r);
  const c1 = Math.floor(u.x + u.r);
  const r0 = Math.floor(u.y - u.r);
  const r1 = Math.floor(u.y + u.r);
  for (let row = r0; row <= r1; row++) {
    if (row < 0 || row >= rows) continue;
    for (let col = c0; col <= c1; col++) {
      if (col < 0 || col >= cols) continue;
      const t = row * cols + col;
      const k = kinds[t];
      let solid = k === 'citadel' || k === 'blocked';
      if (!solid && !flying && occupant[t] !== 0) {
        const st = s.units.get(occupant[t]!) as { kind?: string } | undefined;
        solid = st !== undefined && s.isBlocker(st.kind as never);
      }
      if (!solid) continue;
      pushOut(u, col, row);
    }
  }
}

function pushOut(u: Unit, col: number, row: number) {
  const nx = Math.min(col + 1, Math.max(col, u.x));
  const ny = Math.min(row + 1, Math.max(row, u.y));
  let dx = u.x - nx;
  let dy = u.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= u.r * u.r) return;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    dx /= d;
    dy /= d;
    u.x = nx + dx * u.r;
    u.y = ny + dy * u.r;
    return;
  }
  // Center inside the square: leave by the nearest side.
  const left = u.x - col;
  const right = col + 1 - u.x;
  const up = u.y - row;
  const down = row + 1 - u.y;
  const m = Math.min(left, right, up, down);
  if (m === left) u.x = col - u.r;
  else if (m === right) u.x = col + 1 + u.r;
  else if (m === up) u.y = row - u.r;
  else u.y = row + 1 + u.r;
}
