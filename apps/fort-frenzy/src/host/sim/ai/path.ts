// `path` AI (SPEC §9 Grunt, §15.5): follow the ground field to the base and attack it; aggro-leash
// enemies leave the path for a targetable player, Commander's soldier or HP build (§7.3, RD3,
// RD10-fix-1: exactly like a knight, the nearest wins, a knight on a tie) in the aggro radius, chase
// up to the leash, then go on toward the base from where they stand, not back to where they left
// the path (§9, §11.3; RC2 note).
// Melee swings wind up, root the enemy, and land if the target is still in reach.
import type { EnemyDef } from '../../../content/types';
import { buildTargetable } from '../builds/core';
import { dist, rectDist, rectNearest } from '../geometry';
import { state, type SimState } from '../internal';
import { steerTile } from '../../systems/flowfield';
import {
  BASE_ID,
  type BuildEnt,
  type EnemyEnt,
  type FlowField,
  type PlayerEnt,
  type SimCtx,
  type SoldierEnt,
  type Unit,
} from '../types';

/** A knockback faster than this (tiles/s) overrides walking. */
export const KNOCKED = 1;

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
    const p = s.units.get(e.target!)!;
    const reach = dist(e.x, e.y, p.x, p.y) - e.r - p.r;
    if (reach <= def.attack.range) swing(s, e, def, p.id, p.x, p.y);
    else walkTo(e, p.x, p.y, e.stats.moveSpeed);
    return;
  }
  followPath(s, e, def);
}

/** A Commander's soldier enemies may target: alive and on the ground (§8.4: not in the air). */
export function soldierTargetable(u: SoldierEnt): boolean {
  return u.hp > 0 && !u.flight;
}

/**
 * A unit an aggro-leash enemy may chase: a targetable knight, soldier or HP build (§7.3, §8.4),
 * else null.
 */
export function aggroTarget(s: SimState, id: number | null): Unit | null {
  if (id === null) return null;
  const u = s.units.get(id);
  if (!u) return null;
  const kind = s.kinds.get(id);
  if (kind === 'player') return s.targetable(u as PlayerEnt) ? u : null;
  if (kind === 'soldier') return soldierTargetable(u as SoldierEnt) ? u : null;
  if (kind === 'build') return buildTargetable(u as BuildEnt) ? u : null;
  return null;
}

/**
 * Aggro and leash transitions. Past the leash, or with its target gone, it lets go and walks on
 * toward the base from where it stands (RD10-fix-1); a target it let go at the leash stays ignored
 * until it leaves the aggro radius, so the leash still ends a chase.
 */
export function leash(s: SimState, e: EnemyEnt, a: { radius: number; leash: number }) {
  // A save from before RD10-fix-1 may hold a walk back: it goes on from here instead.
  if (e.ai === 'return') {
    e.ai = 'path';
    e.leashFrom = null;
  }
  if (e.ai === 'aggro') {
    const ok = aggroTarget(s, e.target) !== null;
    const from = e.leashFrom!;
    if (ok && dist(e.x, e.y, from.x, from.y) <= a.leash) return;
    if (ok) e.dropped = e.target!;
    e.ai = 'path';
    e.target = null;
    e.leashFrom = null;
    return;
  }
  let skip = e.dropped;
  if (skip !== undefined) {
    const u = aggroTarget(s, skip);
    if (!u || dist(e.x, e.y, u.x, u.y) - u.r > a.radius) {
      delete e.dropped;
      skip = undefined;
    }
  }
  // Knights first, so a knight wins an exact tie with a soldier or a build.
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const p of s.world.players) {
    if (p.id === skip || !s.targetable(p)) continue;
    const d = dist(e.x, e.y, p.x, p.y) - p.r;
    if (d <= a.radius && d < bestD) {
      best = p;
      bestD = d;
    }
  }
  for (const u of s.world.soldiers) {
    if (u.id === skip || !soldierTargetable(u)) continue;
    const d = dist(e.x, e.y, u.x, u.y) - u.r;
    if (d <= a.radius && d < bestD) {
      best = u;
      bestD = d;
    }
  }
  for (const b of s.world.builds) {
    if (b.id === skip || !buildTargetable(b)) continue;
    const d = dist(e.x, e.y, b.x, b.y) - b.r;
    if (d <= a.radius && d < bestD) {
      best = b;
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
  const field = w.fields.ground;
  const { cols, rows } = field;
  const col = Math.floor(e.x);
  const row = Math.floor(e.y);
  e.ai = 'path';
  e.target = null;
  if (col < 0 || row < 0 || col >= cols || row >= rows) {
    toPortal(s, e, speed);
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
  steerAlong(e, field, t, next, speed);
}

/**
 * Walks along `field` from tile `t` (whose next tile is `next`): straight at the farthest clear tile
 * down the chain (`steerTile`, FF10-fix-1: direct diagonals, no L-shaped routes), else toward the
 * next tile's center blended with the one after so turns don't zigzag (§15.5).
 */
export function steerAlong(e: EnemyEnt, field: FlowField, t: number, next: number, speed: number) {
  const cols = field.cols;
  const far = steerTile(field, t);
  if (far >= 0 && far !== next) {
    const fc = far % cols;
    walkTo(e, fc + 0.5, (far - fc) / cols + 0.5, speed);
    return;
  }
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

/** Off the map: walk to the nearest entry tile of its portal (spawns sit just outside the edge). */
export function toPortal(s: SimState, e: EnemyEnt, speed: number) {
  const portals = s.cat.map.portals;
  const entries = e.portal
    ? portals[e.portal].entry
    : Object.values(portals).flatMap((p) => p.entry);
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

export function walkTo(e: EnemyEnt, x: number, y: number, speed: number) {
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
export function swing(
  s: SimState,
  e: EnemyEnt,
  def: EnemyDef,
  target: number,
  tx: number,
  ty: number,
) {
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
export function land(s: SimState, e: EnemyEnt, def: EnemyDef) {
  const id = e.target;
  if (id === null) return;
  const u = s.units.get(id);
  if (!u || u.hp <= 0) return;
  const kind = s.kinds.get(id);
  // A little extra reach: the target may have stepped back during the wind-up.
  const range = def.attack.range + s.cat.rules.enemySwingSlack;
  if (kind === 'base') {
    if (rectDist(e.x, e.y, s.baseRect) - e.r > range) return;
  } else if (kind === 'player') {
    if (!s.targetable(u as PlayerEnt)) return;
    if (dist(e.x, e.y, u.x, u.y) - e.r - u.r > range) return;
  } else {
    if (dist(e.x, e.y, u.x, u.y) - e.r - u.r > range) return;
  }
  s.damage({ source: e.id, target: id, amount: e.stats.damage, kind: 'melee', tags: [] });
}
