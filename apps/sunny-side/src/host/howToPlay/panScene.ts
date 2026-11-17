// Shared pan staging for How to play cards 4-6 (SPEC §6.9): the big pan layer from panArt (same
// backdrop and framing as card 1), with positions in the pan's local game units (center 0, 0).
import { BIG_PAN } from './panArt';

export { addBigPanLayer, boxPoint } from './panArt';

/** Pan center and start radius in the pan layer's local units (the layer draws at game scale). */
export const PAN_CX = 0;
export const PAN_CY = 0;
export const PAN_R = BIG_PAN.r;
/** Egg radius on the cards (the sim's own size, 56 game px). */
export const EGG_R = BIG_PAN.eggR;

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
