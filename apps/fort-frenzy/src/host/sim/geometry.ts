// Plain geometry on tiles (SPEC §15.3): circles, tile rects, the Citadel's footprint.
import type { Rect } from './internal';

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Distance from a point to a rectangle (0 inside). */
export function rectDist(x: number, y: number, r: Rect): number {
  const dx = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0;
  const dy = y < r.y0 ? r.y0 - y : y > r.y1 ? y - r.y1 : 0;
  return Math.sqrt(dx * dx + dy * dy);
}

/** The point of `r` nearest to (x, y). */
export function rectNearest(x: number, y: number, r: Rect): { x: number; y: number } {
  return { x: Math.min(r.x1, Math.max(r.x0, x)), y: Math.min(r.y1, Math.max(r.y0, y)) };
}

export function tileRect(col: number, row: number): Rect {
  return { x0: col, y0: row, x1: col + 1, y1: row + 1 };
}

/** Does a circle overlap tile (col, row)? */
export function circleTouchesTile(x: number, y: number, r: number, col: number, row: number) {
  const dx = x < col ? col - x : x > col + 1 ? x - col - 1 : 0;
  const dy = y < row ? row - y : y > row + 1 ? y - row - 1 : 0;
  return dx * dx + dy * dy < r * r;
}

/** Input vectors: NaN → 0, −0 → 0 (replays survive JSON), length clamped to 1. */
export function cleanVec(x: number, y: number): { x: number; y: number } {
  let vx = Number.isFinite(x) ? x + 0 : 0;
  let vy = Number.isFinite(y) ? y + 0 : 0;
  const l = vx * vx + vy * vy;
  if (l > 1) {
    const s = 1 / Math.sqrt(l);
    vx *= s;
    vy *= s;
  }
  return { x: vx, y: vy };
}
