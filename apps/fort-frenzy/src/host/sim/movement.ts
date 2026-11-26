// Step 5 (SPEC §15.3): integrate movement and knockback, soft separation between units (they never
// hard-block each other, §15.5), then structure collision: the Citadel, blocked tiles, towers and walls
// are solid squares. Players stay on the map; enemies may stand outside it until they walk in, but
// the map-edge wall (SPEC §9, RD10-fix-4) keeps every forced move of an enemy (knockback, separation,
// structure push-out) from taking its body off the field.
import { buildTargetable } from './builds/core';
import type { FullState } from './state';
import type { EnemyEnt, Unit } from './types';

const DT = 1 / 60;
const KNOCK_STOP = 0.05;

/** Rebuilds the spatial hash: living, present players; soldiers; enemies; targetable builds. */
export function rebuildSpatial(s: FullState): void {
  const w = s.world;
  const h = w.spatial;
  h.clear();
  for (const p of w.players) if (p.respawnAt === null && p.connected) h.insert(p.id, p.x, p.y, p.r);
  // A thrown soldier is in the air (RD9): nothing can hit it until it lands.
  for (const u of w.soldiers) if (u.hp > 0 && !u.flight) h.insert(u.id, u.x, u.y, u.r);
  for (const e of w.enemies) if (e.hp > 0) h.insert(e.id, e.x, e.y, e.r);
  // Enemy shots hit HP builds (§7.3); our attacks filter to enemies.
  for (const b of w.builds) if (buildTargetable(b)) h.insert(b.id, b.x, b.y, b.r);
}

// Reused per-step buffers.
const bodies: Unit[] = [];
let pushX = new Float64Array(256);
let pushY = new Float64Array(256);
// Separation's grid (FF15 perf): typed copies of the bodies, binned by center into 1-tile cells.
const GRID_MARGIN = 3;
let bx = new Float64Array(256);
let by = new Float64Array(256);
let br = new Float64Array(256);
let bid = new Float64Array(256);
let bodyNext = new Int32Array(256);
let near = new Int32Array(256);
let cellHead = new Int32Array(0);

/**
 * The map-edge wall on one axis (SPEC §9, RD10-fix-4): a forced move of an enemy from `from` to `to`
 * stops at the field's edge minus its radius (`lo`..`hi`), and one that starts outside is never taken
 * further out (held, or brought in). Its own walking never goes through here.
 */
export function edgeWall(from: number, to: number, lo: number, hi: number): number {
  if (to > hi && to > from) return Math.max(from, hi);
  if (to < lo && to < from) return Math.min(from, lo);
  return to;
}

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

/**
 * An enemy's step: its walking (`vx`, `vy`) moves it freely, its knockback (`push`) only up to the
 * map-edge wall, which takes that axis of the knockback away (it doesn't keep pressing on the wall).
 */
function integrateEnemy(e: EnemyEnt, decay: number, cols: number, rows: number) {
  const k = e.push;
  if (!k) {
    e.x += e.vx * DT;
    e.y += e.vy * DT;
    return;
  }
  // The same sums as `integrate` while the wall isn't reached, so those steps hash as before.
  const x = e.x + (e.vx + k.x) * DT;
  const y = e.y + (e.vy + k.y) * DT;
  e.x = edgeWall(e.x + e.vx * DT, x, e.r, cols - e.r);
  e.y = edgeWall(e.y + e.vy * DT, y, e.r, rows - e.r);
  k.x = e.x === x ? k.x * decay : 0;
  k.y = e.y === y ? k.y * decay : 0;
  if (Math.abs(k.x) + Math.abs(k.y) < KNOCK_STOP) e.push = null;
}

export function stepMovement(s: FullState): void {
  const w = s.world;
  const decay = s.cat.rules.knockbackDecay;
  const { cols, rows } = w.grid;
  bodies.length = 0;
  for (const p of w.players) {
    if (p.respawnAt !== null || !p.connected) continue;
    integrate(p, decay);
    bodies.push(p);
  }
  const players = bodies.length;
  for (const u of w.soldiers) {
    if (u.hp <= 0 || u.flight) continue;
    integrate(u, decay);
    bodies.push(u);
  }
  const firstEnemy = bodies.length;
  for (const e of w.enemies) {
    if (e.hp <= 0) continue;
    integrateEnemy(e, decay, cols, rows);
    if (!e.flying) bodies.push(e);
  }

  rebuildSpatial(s);
  separate(s, firstEnemy);
  // Players come first in `bodies`.
  for (let i = 0; i < bodies.length; i++) collide(s, bodies[i]!, i < players);
  for (const e of w.enemies) if (e.flying) collide(s, e, false);
}

/**
 * Jacobi soft separation: each overlapping pair is pushed apart by a fraction of the overlap.
 *
 * FF15 perf: pairs come from a center-binned grid over typed copies of the bodies (the spatial-hash
 * query per body, Map lookups and megamorphic property reads were a third of the peak step in dense
 * Swarm packs). Each body still visits its overlapping neighbors of higher id in ascending id order,
 * as the sorted hash query did, so every push sums in the same order: the state hash is unchanged.
 */
function separate(s: FullState, firstEnemy: number) {
  const n = bodies.length;
  if (pushX.length < n) {
    const cap = n * 2;
    pushX = new Float64Array(cap);
    pushY = new Float64Array(cap);
    bx = new Float64Array(cap);
    by = new Float64Array(cap);
    br = new Float64Array(cap);
    bid = new Float64Array(cap);
    bodyNext = new Int32Array(cap);
    near = new Int32Array(cap);
  }
  const { cols, rows } = s.world.grid;
  const gw = cols + 2 * GRID_MARGIN;
  const gh = rows + 2 * GRID_MARGIN;
  if (cellHead.length !== gw * gh) cellHead = new Int32Array(gw * gh);
  cellHead.fill(-1);
  let maxR = 0;
  for (let i = 0; i < n; i++) {
    const b = bodies[i]!;
    const x = b.x;
    const y = b.y;
    bx[i] = x;
    by[i] = y;
    br[i] = b.r;
    bid[i] = b.id;
    pushX[i] = 0;
    pushY[i] = 0;
    if (b.r > maxR) maxR = b.r;
    const c =
      Math.min(gh - 1, Math.max(0, Math.floor(y) + GRID_MARGIN)) * gw +
      Math.min(gw - 1, Math.max(0, Math.floor(x) + GRID_MARGIN));
    bodyNext[i] = cellHead[c]!;
    cellHead[c] = i;
  }
  const k = s.cat.rules.separation * 0.5;
  for (let i = 0; i < n; i++) {
    const ax = bx[i]!;
    const ay = by[i]!;
    const ar = br[i]!;
    const aid = bid[i]!;
    // Every body that can overlap this one has its center within ar + maxR (cells are monotone).
    const reach = ar + maxR;
    const x0 = Math.min(gw - 1, Math.max(0, Math.floor(ax - reach) + GRID_MARGIN));
    const x1 = Math.min(gw - 1, Math.max(0, Math.floor(ax + reach) + GRID_MARGIN));
    const y0 = Math.min(gh - 1, Math.max(0, Math.floor(ay - reach) + GRID_MARGIN));
    const y1 = Math.min(gh - 1, Math.max(0, Math.floor(ay + reach) + GRID_MARGIN));
    let m = 0;
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        for (let j = cellHead[gy * gw + gx]!; j !== -1; j = bodyNext[j]!) {
          const id = bid[j]!;
          if (id <= aid) continue;
          const dx = bx[j]! - ax;
          const dy = by[j]! - ay;
          const rr = ar + br[j]!;
          if (dx * dx + dy * dy >= rr * rr) continue;
          // Insert by id (lists are short).
          let q = m++;
          while (q > 0 && bid[near[q - 1]!]! > id) {
            near[q] = near[q - 1]!;
            q--;
          }
          near[q] = j;
        }
      }
    }
    for (let q = 0; q < m; q++) {
      const j = near[q]!;
      let dx = bx[j]! - ax;
      let dy = by[j]! - ay;
      const rr = ar + br[j]!;
      const d2 = dx * dx + dy * dy;
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
  for (let i = 0; i < firstEnemy; i++) {
    const b = bodies[i]!;
    b.x += pushX[i]!;
    b.y += pushY[i]!;
  }
  // Enemies come last in `bodies`; the map-edge wall holds them.
  for (let i = firstEnemy; i < n; i++) {
    const b = bodies[i]!;
    b.x = edgeWall(b.x, b.x + pushX[i]!, b.r, cols - b.r);
    b.y = edgeWall(b.y, b.y + pushY[i]!, b.r, rows - b.r);
  }
}

/** Pushes a circle out of solid tiles; players are also kept on the map. */
function collide(s: FullState, u: Unit, isPlayer: boolean) {
  const { cols, rows, kinds } = s.world.grid;
  if (isPlayer) {
    u.x = Math.min(cols - u.r, Math.max(u.r, u.x));
    u.y = Math.min(rows - u.r, Math.max(u.r, u.y));
  }
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
      if (k !== 'citadel' && k !== 'blocked') continue;
      pushOut(u, col, row, isPlayer ? 0 : cols, rows);
    }
  }
}

/** `cols` > 0 for an enemy: the map-edge wall rules out leaving by a side off the field. */
function pushOut(u: Unit, col: number, row: number, cols: number, rows: number) {
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
  // Center inside the square: leave by the nearest side (an enemy's on the field, SPEC §9).
  let left = u.x - col;
  let right = col + 1 - u.x;
  let up = u.y - row;
  let down = row + 1 - u.y;
  if (cols > 0) {
    if (col - u.r < u.r) left = Infinity;
    if (col + 1 + u.r > cols - u.r) right = Infinity;
    if (row - u.r < u.r) up = Infinity;
    if (row + 1 + u.r > rows - u.r) down = Infinity;
  }
  const m = Math.min(left, right, up, down);
  if (m === left) u.x = col - u.r;
  else if (m === right) u.x = col + 1 + u.r;
  else if (m === up) u.y = row - u.r;
  else u.y = row + 1 + u.r;
}
