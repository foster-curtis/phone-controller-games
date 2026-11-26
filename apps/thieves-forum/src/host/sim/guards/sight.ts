// What a guard can see (SPEC §6.3, §6.12): a view cone (range + half-angle around his facing) with line
// of sight against the layout's blockers, so a stall between guard and thief blocks the spot and ducking
// into an alley breaks it. A chasing guard turns his head after the thief, so chase sight is range + LOS
// without the angle (BUILD_PLAN §8 [TF9]).
import type { Balance, LaneId, LayoutDef, Vec2 } from '../../../content/types';
import { angleDiff, dist, inRect } from '../geometry';
import { lineOfSight } from '../nav';
import type { Guard } from '../types';

export const coneHalfAngle = (b: Balance): number => (b.guards.coneHalfDeg * Math.PI) / 180;

/** Inside the cone's wedge (range and half-angle), ignoring blockers. */
export function inWedge(g: Guard, p: Vec2, b: Balance): boolean {
  const d = dist(g.x, g.y, p.x, p.y);
  if (d > b.guards.coneRange) return false;
  if (d < 1e-6) return true;
  return Math.abs(angleDiff(Math.atan2(p.y - g.y, p.x - g.x), g.facing)) <= coneHalfAngle(b) + 1e-9;
}

/** In the cone with a clear line of sight (SPEC §6.12 spotting). */
export function inCone(g: Guard, p: Vec2, layout: LayoutDef, b: Balance, gateOpen: boolean): boolean {
  return inWedge(g, p, b) && lineOfSight(layout, g, p, gateOpen);
}

/** A chasing guard sees the thief: within cone range with a clear line of sight (SPEC §6.12 chase). */
export function canSee(g: Guard, p: Vec2, layout: LayoutDef, b: Balance, gateOpen: boolean): boolean {
  return dist(g.x, g.y, p.x, p.y) <= b.guards.coneRange && lineOfSight(layout, g, p, gateOpen);
}

/** The walking lane a point is in, or null (alleys, passages, off the map). */
export function laneOf(layout: LayoutDef, p: Vec2): LaneId | null {
  for (const lane of Object.values(layout.lanes)) if (inRect(p.x, p.y, lane.rect)) return lane.id;
  return null;
}
