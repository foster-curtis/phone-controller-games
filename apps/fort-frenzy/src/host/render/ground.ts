// Ground-ellipse math (SPEC §2.1, §2.4, §2.5, §15.2): shadows, player rings with their aim notch and
// the carried-cell pips. Pure: the Phaser drawing lives in groundMarks.ts.
import { GROUND_SQUASH } from './camera';

/** Shadow sizes in sprite units (§2.5): knight about 22 × 13, Colossus about 60 × 36. */
export const SHADOW = { knight: [22, 13], colossus: [60, 36] } as const;

/** Pip offset outside the ring, sprite units: (rx + 8, ry + 4.8) (§15.2). */
export const PIP_PAD_X = 8;
export const PIP_PAD_Y = PIP_PAD_X * GROUND_SQUASH;

/**
 * Carried-cell pip slot `k` (0-based) of `cap` around a ring centered at (cx, cy) with radii (rx, ry),
 * all in sprite units: angle a = 90° + (cap − 1)·7.5° − k·15° (screen space, y down), at
 * (cx + (rx + 8)·cos a, cy + (ry + 4.8)·sin a). Slot 0 is the leftmost on the front arc.
 */
export function carryPip(
  k: number,
  cap: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): { x: number; y: number } {
  const a = ((90 + (cap - 1) * 7.5 - k * 15) * Math.PI) / 180;
  return { x: cx + (rx + PIP_PAD_X) * Math.cos(a), y: cy + (ry + PIP_PAD_Y) * Math.sin(a) };
}

/** Every slot of a cap, left to right; `filled` = cells carried. Empty when nothing is carried. */
export function carryPips(
  carried: number,
  cap: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): { x: number; y: number; filled: boolean }[] {
  if (carried <= 0) return [];
  return Array.from({ length: cap }, (_, k) => ({
    ...carryPip(k, cap, cx, cy, rx, ry),
    filled: k < carried,
  }));
}

/**
 * A point on a ground ellipse for a world-space direction (radians, x right, y down-field): the
 * world circle's point projected, so the notch points where the unit aims.
 */
export function ellipsePoint(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angle: number,
): { x: number; y: number } {
  return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
}
