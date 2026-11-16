// Shared pan staging for How to play cards 4-6 (SPEC §6.9): one pan placement in the 960x540
// illustration box and small pure helpers, so the three scripts frame the pan the same way.
import { ILLUSTRATION_H } from './types';

/** Pan center and start radius in illustration units (the handle runs right, still inside 960). */
export const PAN_CX = 420;
export const PAN_CY = ILLUSTRATION_H / 2;
export const PAN_R = 220;
/** Egg radius used on the cards (the sim's own size, 36 px). */
export const EGG_R = 36;

export interface Vec {
  x: number;
  y: number;
}

export const mix = (a: Vec, b: Vec, p: number): Vec => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
});

/** Point `dist` from the pan center along the direction through `p`. */
export function alongFromCenter(p: Vec, dist: number): Vec {
  const dx = p.x - PAN_CX;
  const dy = p.y - PAN_CY;
  const len = Math.hypot(dx, dy) || 1;
  return { x: PAN_CX + (dx / len) * dist, y: PAN_CY + (dy / len) * dist };
}
