// The frying pan (SPEC §6.0): always drawn at its START radius with a rim and a handle, sitting on a
// light kitchen counter. While it "shrinks" the pan does not get smaller: the ring between the
// current safe radius and the original edge is the heated zone (`heat`), growing inward. Eggs fall
// when their center crosses the current radius, marked by the sticker-outlined inner edge of the heat.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import type { SimSnapshot } from '../sim/types';
import { HEIGHT, WIDTH } from './layout';

export const RIM_WIDTH = 14;
const PULSE_PERIOD_MS = 700;
const TILE = 120;
const HANDLE_ANGLE = (20 * Math.PI) / 180;
const HANDLE_LENGTH = 300;
const HANDLE_WIDTH = 46;

/** 0..1 pulse used by the heat zone; a smooth wave over `PULSE_PERIOD_MS`. */
export function heatPulse(now: number): number {
  return 0.5 + 0.5 * Math.sin((now / PULSE_PERIOD_MS) * Math.PI * 2);
}

export interface ArenaGeometry {
  /** Radius the pan body is drawn at: always the start radius. */
  panRadius: number;
  /** Heated ring [heatInner, heatOuter]; null while nothing has heated yet. */
  heat: { inner: number; outer: number } | null;
  /** The ring-out boundary (current sim radius). */
  safeRadius: number;
}

export function arenaGeometry(arena: SimSnapshot['arena']): ArenaGeometry {
  const outer = Math.max(arena.startRadius, arena.radius);
  const heating = arena.shrinking && arena.radius < outer;
  return {
    panRadius: outer,
    heat: heating ? { inner: arena.radius, outer } : null,
    safeRadius: arena.radius,
  };
}

/** Handle start/end points (relative to the pan center) for a pan of radius `r`. */
export function handleSegment(r: number): { x0: number; y0: number; x1: number; y1: number } {
  const c = Math.cos(HANDLE_ANGLE);
  const s = Math.sin(HANDLE_ANGLE);
  const a = r + RIM_WIDTH / 2;
  return { x0: c * a, y0: s * a, x1: c * (a + HANDLE_LENGTH), y1: s * (a + HANDLE_LENGTH) };
}

function drawCounter(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number): void {
  // Counter tiles and a burner ring under the pan; `cream` is the lighter surface.
  g.fillStyle(theme.color.cream.num, 1);
  g.fillRect(0, 0, WIDTH, HEIGHT);
  g.lineStyle(2, theme.color.brandGray.num, 0.18);
  for (let x = cx % TILE; x < WIDTH; x += TILE) g.lineBetween(x, 0, x, HEIGHT);
  for (let y = cy % TILE; y < HEIGHT; y += TILE) g.lineBetween(0, y, WIDTH, y);
  g.lineStyle(10, theme.color.brandGray.num, 0.22);
  g.strokeCircle(cx, cy, r + 40);
  g.lineStyle(4, theme.color.brandGray.num, 0.22);
  g.strokeCircle(cx, cy, r + 62);
}

function drawHandle(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number): void {
  const { x0, y0, x1, y1 } = handleSegment(r);
  const sh = theme.shadow.sticker;
  const edge = theme.stroke.sticker;
  g.lineStyle(HANDLE_WIDTH + edge * 2, sh.color.num, 1);
  g.lineBetween(cx + x0 + sh.x, cy + y0 + sh.y, cx + x1 + sh.x, cy + y1 + sh.y);
  g.lineStyle(HANDLE_WIDTH + edge * 2, theme.color.stickerOutline.num, 1);
  g.lineBetween(cx + x0, cy + y0, cx + x1, cy + y1);
  g.lineStyle(HANDLE_WIDTH, theme.color.panRim.num, 1);
  g.lineBetween(cx + x0, cy + y0, cx + x1, cy + y1);
  // Grip: the far 60% in the darker pan tone.
  const gx = x0 + (x1 - x0) * 0.4;
  const gy = y0 + (y1 - y0) * 0.4;
  g.lineStyle(HANDLE_WIDTH - edge * 4, theme.color.pan.num, 1);
  g.lineBetween(cx + gx, cy + gy, cx + x1 - 6, cy + y1 - 2);
}

export function drawArena(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  arena: SimSnapshot['arena'],
  now: number,
): void {
  const geo = arenaGeometry(arena);
  const R = geo.panRadius;
  const edge = theme.stroke.sticker;
  drawCounter(g, cx, cy, R);
  drawHandle(g, cx, cy, R);

  // Hard sticker shadow, then the pan body and rim.
  const sh = theme.shadow.sticker;
  g.fillStyle(sh.color.num, 1);
  g.fillCircle(cx + sh.x, cy + sh.y, R + RIM_WIDTH + edge);
  g.fillStyle(theme.color.stickerOutline.num, 1);
  g.fillCircle(cx, cy, R + RIM_WIDTH + edge);
  g.fillStyle(theme.color.panRim.num, 1);
  g.fillCircle(cx, cy, R + RIM_WIDTH);
  g.fillStyle(theme.color.pan.num, 1);
  g.fillCircle(cx, cy, R);
  g.lineStyle(edge, theme.color.stickerOutline.num, 1);
  g.strokeCircle(cx, cy, R);

  if (geo.heat) {
    const { inner, outer } = geo.heat;
    const p = heatPulse(now);
    // Heated ring across its whole area, glowing brighter with the pulse.
    g.lineStyle(outer - inner, theme.color.heat.num, 0.7 + 0.3 * p);
    g.strokeCircle(cx, cy, (outer + inner) / 2);
    // Ring-out boundary: ink line with a light inner edge, clearly readable on the heat.
    g.lineStyle(edge * 2, theme.color.stickerOutline.num, 1);
    g.strokeCircle(cx, cy, inner);
    g.lineStyle(edge / 2, theme.color.stickerEdge.num, 0.5 + 0.5 * p);
    g.strokeCircle(cx, cy, inner - edge);
    // Rim glows too.
    g.lineStyle(RIM_WIDTH / 2, theme.color.heat.num, 0.25 + 0.5 * p);
    g.strokeCircle(cx, cy, outer + RIM_WIDTH / 2);
  }
}
