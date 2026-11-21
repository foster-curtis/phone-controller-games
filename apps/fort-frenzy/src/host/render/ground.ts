// Ground-ellipse math (SPEC §2.1, §2.4, §2.5, §15.2): shadows, player rings with their aim notch. Pure: the Phaser drawing lives in groundMarks.ts.

/** Shadow sizes in sprite units (§2.5): knight about 22 × 13, Colossus about 60 × 36. */
export const SHADOW = { knight: [22, 13], colossus: [60, 36] } as const;

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
