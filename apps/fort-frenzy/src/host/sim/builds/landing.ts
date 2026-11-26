// Where a build lands (SPEC §7.1, §7.3, §15.11 #101): one source for the sim's placement and the
// TV's throw preview (preview.ts). Builds don't snap to tiles. A thrown build flies `aim` × its throw
// range from the knight (the stick's length sets the distance, so the landing never passes the
// range; aim 0,0, a quick tap, lands at the knight's feet); the point is then clamped to the
// playfield and pushed outside the Citadel's footprint, by the build's body radius. Pure.
import type { Vec2 } from '../../../content/types';
import type { Rect } from '../internal';

/** The playfield (tiles) and the Citadel's footprint. */
export interface LandingArea {
  cols: number;
  rows: number;
  citadel: Rect;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Clamps a point to the playfield and outside the Citadel, `r` (body radius) clear of both. */
export function clampLanding(x: number, y: number, r: number, area: LandingArea): Vec2 {
  let px = clamp(x, r, area.cols - r);
  let py = clamp(y, r, area.rows - r);
  const c = area.citadel;
  const x0 = c.x0 - r;
  const x1 = c.x1 + r;
  const y0 = c.y0 - r;
  const y1 = c.y1 + r;
  if (px > x0 && px < x1 && py > y0 && py < y1) {
    // Out the shortest way that stays on the field (the Citadel sits on the top edge: usually south).
    const ways = [
      { d: px - x0, x: x0, y: py },
      { d: x1 - px, x: x1, y: py },
      { d: py - y0, x: px, y: y0 },
      { d: y1 - py, x: px, y: y1 },
    ];
    let best: (typeof ways)[number] | null = null;
    for (const o of ways) {
      const inside = o.x >= r && o.x <= area.cols - r && o.y >= r && o.y <= area.rows - r;
      if (inside && (best === null || o.d < best.d)) best = o;
    }
    if (best) {
      px = best.x;
      py = best.y;
    }
  }
  return { x: px, y: py };
}

/**
 * A thrown build's landing: `from` + `aim` (length ≤ 1) × `range`, then `clampLanding`. Aim 0,0
 * lands at `from` (a quick tap: the knight's feet).
 */
export function throwLanding(
  from: Vec2,
  aim: Vec2,
  range: number,
  r: number,
  area: LandingArea,
): Vec2 {
  const l = Math.hypot(aim.x, aim.y);
  const k = l > 1 ? range / l : range;
  return clampLanding(from.x + aim.x * k, from.y + aim.y * k, r, area);
}
