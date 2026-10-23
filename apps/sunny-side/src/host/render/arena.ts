// The skillet (SPEC §6.0): pan fill with a rim. While the pan shrinks, its edge overheats: the rim
// glows `heat` and pulses (the shrink warning).
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import type { SimSnapshot } from '../sim/types';

export const RIM_WIDTH = 14;
const PULSE_PERIOD_MS = 700;

/** 0..1 pulse used by the heat edge; a smooth wave over `PULSE_PERIOD_MS`. */
export function heatPulse(now: number): number {
  return 0.5 + 0.5 * Math.sin((now / PULSE_PERIOD_MS) * Math.PI * 2);
}

export function drawArena(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  arena: SimSnapshot['arena'],
  now: number,
): void {
  const r = arena.radius;
  if (arena.shrinking && arena.startRadius > r) {
    // The burnt-off outer ring where the pan used to be.
    g.lineStyle(theme.stroke.sticker, theme.color.panRim.num, 0.35);
    g.strokeCircle(cx, cy, arena.startRadius + RIM_WIDTH / 2);
  }
  g.fillStyle(theme.color.pan.num, 1);
  g.fillCircle(cx, cy, r);
  g.lineStyle(RIM_WIDTH, theme.color.panRim.num, 1);
  g.strokeCircle(cx, cy, r + RIM_WIDTH / 2);
  if (arena.shrinking) {
    const p = heatPulse(now);
    g.lineStyle(RIM_WIDTH * 2.2, theme.color.heat.num, 0.12 + 0.2 * p);
    g.strokeCircle(cx, cy, r + RIM_WIDTH / 2);
    g.lineStyle(RIM_WIDTH, theme.color.heat.num, 0.55 + 0.45 * p);
    g.strokeCircle(cx, cy, r + RIM_WIDTH / 2);
    g.lineStyle(theme.stroke.sticker * 2, theme.color.heat.num, 0.25 + 0.4 * p);
    g.strokeCircle(cx, cy, r - theme.stroke.sticker * 2);
  }
}
