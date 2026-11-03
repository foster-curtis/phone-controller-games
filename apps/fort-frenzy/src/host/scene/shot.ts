// Where a knight's shot is drawn from (SPEC §2.4, §15.2; C2 note 2). The sim fires the projectile
// from the feet at once; the picture holds it on the bow until the attack clip's release, then
// launches it from the rig's shot origin (the Ranger's `bolt` attach point) at bow height and eases
// it onto the sim's path. Render only: the sim's hit geometry is unchanged. Pure, so it's tested.
import { lerp } from '@pcg/game-kit';
import { DRAW_END_MS, RELEASE_MS } from '../render/clips/ranger';
import type { Camera, ScreenPoint } from '../render/types';

export interface Pos {
  x: number;
  y: number;
  z: number;
}

/** How long a launched bolt takes to settle onto the sim's path, ms. */
export const CATCHUP_MS = 150;

export interface ShotTiming {
  /** Where the attack clip starts, ms. */
  offsetMs: number;
  /** How long after the sim's shot the bolt leaves the bow, ms. */
  delayMs: number;
}

/**
 * The Ranger draws, holds and releases (the clip's `RELEASE_MS`); already at full draw (aiming or
 * Steady Aim: the `ready` pose) he skips the draw and only holds. Rigs without a draw shoot at once.
 */
export function shotTiming(rigId: string, drawn: boolean): ShotTiming {
  if (rigId !== 'ranger') return { offsetMs: 0, delayMs: 0 };
  const offsetMs = drawn ? DRAW_END_MS : 0;
  return { offsetMs, delayMs: RELEASE_MS - offsetMs };
}

/**
 * A screen point on a unit standing at `feet` as a world position: same row, x from the screen
 * offset and the height above the feet as z, so `worldToScreen` gives the point back.
 */
export function anchorToWorld(
  anchor: ScreenPoint,
  feet: { x: number; y: number },
  cam: Pick<Camera, 'worldToScreen'>,
): Pos {
  const f = cam.worldToScreen(feet.x, feet.y, 0);
  const tile = cam.worldToScreen(feet.x + 1, feet.y, 0).sx - f.sx;
  return { x: feet.x + (anchor.sx - f.sx) / tile, y: feet.y, z: (f.sy - anchor.sy) / tile };
}

export interface Launch {
  bornMs: number;
  delayMs: number;
  /** The shot origin at the release (world, with height); null draws the sim position as is. */
  origin: Pos | null;
}

/**
 * Where to draw a launched shot at `nowMs`: null before the release; then from the origin, easing
 * onto the sim position `sim` over `CATCHUP_MS` while keeping the bow's height.
 */
export function shotPos(l: Launch, nowMs: number, sim: Pos): Pos | null {
  const age = nowMs - l.bornMs;
  if (age < l.delayMs) return null;
  const o = l.origin;
  if (!o) return sim;
  const u = Math.min(1, (age - l.delayMs) / CATCHUP_MS);
  const e = 1 - (1 - u) * (1 - u);
  return { x: lerp(o.x, sim.x, e), y: lerp(o.y, sim.y, e), z: sim.z + o.z };
}
