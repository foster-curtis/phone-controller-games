// `path` AI (SPEC §9 Grunt, §15.5): follow the flow field to the base and attack whatever blocks it
// (a tower or wall on the next tile) or the base itself; aggro-leash enemies leave the path for a
// targetable player in the aggro radius, chase up to the leash, then walk back (§9, §11.3).
// Melee swings wind up, root the enemy, and land if the target is still in reach.
import type { EnemyDef } from '../../../content/types';
import { dist, rectDist, rectNearest, tileRect } from '../geometry';
import { state, type SimState } from '../internal';
import { BASE_ID, type EnemyEnt, type PlayerEnt, type SimCtx, type StructureEnt } from '../types';

/** Extra reach when a wound-up swing lands (the target may have stepped back a little). */
const LAND_SLACK = 0.25;
/** A knockback faster than this (tiles/s) overrides walking. */
const KNOCKED = 1;

export function pathAi(ctx: SimCtx, e: EnemyEnt): void {
  const s = state(ctx);
  const def = s.cat.enemy(e.kind);
  if (e.attack.windupEndsAt !== null) {
    // A swing at a player who went down or dazed is called off (they're untargetable, §11.3).
    const p = e.target === null ? undefined : s.units.get(e.target);
    const lost =
      p === undefined || (s.kinds.get(p.id) === 'player' && !s.targetable(p as PlayerEnt));
    if (lost) {
      e.attack.windupEndsAt = null;
    } else {
      e.vx = e.vy = 0;
      if (s.tick() >= e.attack.windupEndsAt) {
        e.attack.windupEndsAt = null;
        land(s, e, def);
      }
      return;
    }
  }
  if (e.push && Math.abs(e.push.x) + Math.abs(e.push.y) > KNOCKED) {
    e.vx = e.vy = 0;
    return;
  }
  if (def.aggro) leash(s, e, def.aggro);

  if (e.ai === 'aggro') {
    const p = s.units.get(e.target!) as PlayerEnt;
    const reach = dist(e.x, e.y, p.x, p.y) - e.r - p.r;
    if (reach <= def.attack.range) swing(s, e, def, p.id, p.x, p.y);
    else walkTo(e, p.x, p.y, e.stats.moveSpeed);
    return;
  }
  if (e.ai === 'return') {
    walkTo(e, e.leashFrom!.x, e.leashFrom!.y, e.stats.moveSpeed);
    return;
  }
  followPath(s, e, def);
}

/** Aggro and leash transitions. */
function leash(s: SimState, e: EnemyEnt, a: { radius: number; leash: number }) {
  if (e.ai === 'aggro') {
    const p = e.target === null ? undefined : (s.units.get(e.target) as PlayerEnt | undefined);
    const ok = p !== undefined && s.kinds.get(p.id) === 'player' && s.targetable(p);
    const from = e.leashFrom!;
    if (!ok || dist(e.x, e.y, from.x, from.y) > a.leash) {
      e.ai = 'return';
      e.target = null;
    }
    return;
  }
  if (e.ai === 'return') {
    const from = e.leashFrom!;
    if (dist(e.x, e.y, from.x, from.y) <= 0.5) {
      e.ai = 'path';
      e.leashFrom = null;
    }
    return;
  }
  let best: PlayerEnt | null = null;
  let bestD = Infinity;
  for (const p of s.world.players) {
    if (!s.targetable(p)) continue;
    const d = dist(e.x, e.y, p.x, p.y) - p.r;
    if (d <= a.radius && d < bestD) {
      best = p;
      bestD = d;
    }
  }
  if (best) {
    e.ai = 'aggro';
    e.target = best.id;
    e.leashFrom = { x: e.x, y: e.y };
  }
}

function followPath(s: SimState, e: EnemyEnt, def: EnemyDef) {
  const w = s.world;
  const speed = e.stats.moveSpeed;
  // In reach of the Citadel: attack it.
  if (rectDist(e.x, e.y, s.baseRect) - e.r <= def.attack.range) {
    const n = rectNearest(e.x, e.y, s.baseRect);
    swing(s, e, def, BASE_ID, n.x, n.y);
    return;
  }
  const field = def.field === 'breaker' ? w.fields.breaker : w.fields.ground;
  const { cols, rows } = field;
  const col = Math.floor(e.x);
  const row = Math.floor(e.y);
  e.ai = 'path';
  e.target = null;
  if (col < 0 || row < 0 || col >= cols || row >= rows) {
    toLane(s, e, speed);
    return;
  }
  const t = row * cols + col;
  const next = field.next[t]!;
  if (next < 0) {
    // A goal tile (or cut off): head straight for the Citadel.
    const n = rectNearest(e.x, e.y, s.baseRect);
    walkTo(e, n.x, n.y, speed);
    return;
  }
  const occ = w.grid.occupant[next]!;
  if (occ !== 0) {
    const st = s.units.get(occ) as StructureEnt | undefined;
    if (st && st.damageable && s.cat.structure(st.kind).pathCost > 1) {
      const nc = next % cols;
      const nr = (next - nc) / cols;
      if (rectDist(e.x, e.y, tileRect(nc, nr)) - e.r <= def.attack.range) {
        swing(s, e, def, st.id, st.x, st.y);
        return;
      }
      walkTo(e, st.x, st.y, speed);
      return;
    }
  }
  // Toward the next tile's center, blended with the one after so turns don't zigzag (§15.5).
  const nc = next % cols;
  let dx = nc + 0.5 - e.x;
  let dy = (next - nc) / cols + 0.5 - e.y;
  let l = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= l;
  dy /= l;
  const after = field.next[next]!;
  if (after >= 0) {
    const ac = after % cols;
    let ax = ac + 0.5 - e.x;
    let ay = (after - ac) / cols + 0.5 - e.y;
    const al = Math.sqrt(ax * ax + ay * ay) || 1;
    ax /= al;
    ay /= al;
    dx += 0.5 * ax;
    dy += 0.5 * ay;
    l = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= l;
    dy /= l;
  }
  e.vx = dx * speed;
  e.vy = dy * speed;
  e.facing = Math.atan2(dy, dx);
}

/** Off the map: walk to the nearest entry tile of the lane (spawns sit just outside the edge). */
function toLane(s: SimState, e: EnemyEnt, speed: number) {
  const lanes = s.cat.map.lanes;
  const entries = e.lane ? lanes[e.lane].entry : Object.values(lanes).flatMap((l) => l.entry);
  let bx = 0;
  let by = 0;
  let bd = Infinity;
  for (const [c, r] of entries) {
    const d = dist(e.x, e.y, c + 0.5, r + 0.5);
    if (d < bd) {
      bd = d;
      bx = c + 0.5;
      by = r + 0.5;
    }
  }
  walkTo(e, bx, by, speed);
}

function walkTo(e: EnemyEnt, x: number, y: number, speed: number) {
  const dx = x - e.x;
  const dy = y - e.y;
  const l = Math.sqrt(dx * dx + dy * dy);
  if (l < 1e-6) {
    e.vx = e.vy = 0;
    return;
  }
  const v = Math.min(speed, l * 60);
  e.vx = (dx / l) * v;
  e.vy = (dy / l) * v;
  e.facing = Math.atan2(dy, dx);
}

/** Starts a wind-up at `target` (or waits out the cooldown in place). */
function swing(s: SimState, e: EnemyEnt, def: EnemyDef, target: number, tx: number, ty: number) {
  e.vx = e.vy = 0;
  e.target = target;
  if (e.ai !== 'aggro') e.ai = 'attack';
  e.facing = Math.atan2(ty - e.y, tx - e.x);
  const t = s.tick();
  if (t < e.attack.readyAt) return;
  const a = def.attack;
  e.attack.readyAt = t + s.cat.steps(a.cooldownMs / Math.max(0.05, e.stats.attackSpeed || 1));
  s.emit({ e: 'attack', source: e.id, slot: 'attack', x: e.x, y: e.y, angle: e.facing });
  const wind = a.windupMs ? s.cat.steps(a.windupMs) : 0;
  if (wind > 0) e.attack.windupEndsAt = t + wind;
  else land(s, e, def);
}

/** A swing lands: damage if the target is still there and in reach. */
function land(s: SimState, e: EnemyEnt, def: EnemyDef) {
  const id = e.target;
  if (id === null) return;
  const u = s.units.get(id);
  if (!u || u.hp <= 0) return;
  const kind = s.kinds.get(id);
  const range = def.attack.range + LAND_SLACK;
  let mult = 1;
  if (kind === 'base') {
    if (rectDist(e.x, e.y, s.baseRect) - e.r > range) return;
    mult = def.vsStructure?.base ?? 1;
  } else if (kind === 'structure') {
    const st = u as StructureEnt;
    if (!st.damageable) return;
    if (rectDist(e.x, e.y, tileRect(st.tile[0], st.tile[1])) - e.r > range) return;
    mult = def.vsStructure?.[st.kind] ?? 1;
  } else if (kind === 'player') {
    if (!s.targetable(u as PlayerEnt)) return;
    if (dist(e.x, e.y, u.x, u.y) - e.r - u.r > range) return;
  } else {
    if (dist(e.x, e.y, u.x, u.y) - e.r - u.r > range) return;
  }
  s.damage({ source: e.id, target: id, amount: e.stats.damage * mult, kind: 'melee', tags: [] });
}
