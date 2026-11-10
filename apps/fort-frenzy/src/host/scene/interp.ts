// Render interpolation (SPEC §15.2): the TV draws positions lerped between the last two sim steps,
// keyed by entity id; a jump longer than `SNAP_TILES` (respawn, debug) snaps. Pure, so it's tested.
// C3 (FF10-fix-1): the Wasp jumped back and forth because its ground point was drawn with z = 0
// lerped from the previous step's sim z (1 for flyers), so its screen height swung with the
// accumulator's phase every frame. `lerpGround` keeps both ends on the ground.
import { lerp } from '@pcg/game-kit';
import type { Pos } from './shot';

/** A jump longer than this between two steps (Manhattan, tiles) snaps instead of lerping. */
export const SNAP_TILES = 2;

/** The position `alpha` of the way from the previous step's `prev` to the current (x, y, z). */
export function lerpPos(
  prev: Pos | undefined,
  x: number,
  y: number,
  z: number,
  alpha: number,
): Pos {
  if (!prev || Math.abs(prev.x - x) + Math.abs(prev.y - y) >= SNAP_TILES) return { x, y, z };
  return { x: lerp(prev.x, x, alpha), y: lerp(prev.y, y, alpha), z: lerp(prev.z, z, alpha) };
}

/** The ground point under a body (z = 0 at both ends, whatever height the sim gives it). */
export function lerpGround(prev: Pos | undefined, x: number, y: number, alpha: number): Pos {
  return lerpPos(prev && { x: prev.x, y: prev.y, z: 0 }, x, y, 0, alpha);
}
