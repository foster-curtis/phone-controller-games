// Shared AI steps for the FF10 roster (SPEC §15.5): one step along a flow field (blended toward the
// tile after next so turns don't zigzag), what blocks it, and the melee wind-up every swinging enemy
// shares (it roots the enemy and is called off if a player target goes down or dazed).
import type { EnemyDef } from '../../../content/types';
import { rectNearest } from '../geometry';
import type { SimState } from '../internal';
import type { EnemyEnt, FlowField, PlayerEnt, StructureEnt } from '../types';
import { land, toLane, walkTo } from './path';

export type FieldStep =
  /** Walking: velocity set. */
  | { kind: 'walk' }
  /** At a goal tile (or cut off): the caller decides where to go; no velocity set. */
  | { kind: 'goal' }
  /** A damageable blocker (wall, tower) sits on the next tile; no velocity set. */
  | { kind: 'blocked'; st: StructureEnt; col: number; row: number };

/** One step along `field` at `speed`. Off the map, walks to its lane's entry. */
export function fieldStep(s: SimState, e: EnemyEnt, field: FlowField, speed: number): FieldStep {
  const { cols, rows } = field;
  const col = Math.floor(e.x);
  const row = Math.floor(e.y);
  if (col < 0 || row < 0 || col >= cols || row >= rows) {
    toLane(s, e, speed);
    return { kind: 'walk' };
  }
  const next = field.next[row * cols + col]!;
  if (next < 0) return { kind: 'goal' };
  const occ = s.world.grid.occupant[next]!;
  if (occ !== 0) {
    const st = s.units.get(occ) as StructureEnt | undefined;
    if (st && st.damageable && s.cat.structure(st.kind).pathCost > 1) {
      const nc = next % cols;
      return { kind: 'blocked', st, col: nc, row: (next - nc) / cols };
    }
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
  return { kind: 'walk' };
}

/** Walks straight at the Citadel's nearest point. */
export function toBase(s: SimState, e: EnemyEnt, speed: number): void {
  const n = rectNearest(e.x, e.y, s.baseRect);
  walkTo(e, n.x, n.y, speed);
}

/**
 * A melee wind-up in progress: roots the enemy and lands on its tick. Returns true while busy (the
 * caller skips its own step); a wind-up at a player who went down or dazed is called off.
 */
export function windup(s: SimState, e: EnemyEnt, def: EnemyDef): boolean {
  if (e.attack.windupEndsAt === null) return false;
  const u = e.target === null ? undefined : s.units.get(e.target);
  const lost = u === undefined || (s.kinds.get(u.id) === 'player' && !s.targetable(u as PlayerEnt));
  if (lost) {
    e.attack.windupEndsAt = null;
    return false;
  }
  e.vx = e.vy = 0;
  if (s.tick() >= e.attack.windupEndsAt) {
    e.attack.windupEndsAt = null;
    land(s, e, def);
  }
  return true;
}

/** A knockback faster than 1 tile/s overrides walking (BUILD_PLAN §8, FF6). */
export function knocked(e: EnemyEnt): boolean {
  if (e.push && Math.abs(e.push.x) + Math.abs(e.push.y) > 1) {
    e.vx = e.vy = 0;
    return true;
  }
  return false;
}
