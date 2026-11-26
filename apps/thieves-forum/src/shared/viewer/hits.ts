// Tip-off snapshot geometry (SPEC §6.13, §6.17, §12.6): character screen boxes → `HitArea`s in snapshot
// pixels, the image fitted to the phone screen, and "tap → nearest hit area". Pure functions, no DOM
// and no game imports, so the host, the phone and tests share them (extraction candidate, BUILD_PLAN §8).
import type { HitArea } from './types';

/** A character's screen box in source (TV canvas) pixels; `id` becomes the opaque `targetId`. */
export interface ScreenBox {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Scales source boxes into a `w × h` snapshot. Boxes are clipped to the image and rounded to whole
 * pixels; ones fully off the image, and `exclude` (the tipper's own character), are left out.
 */
export function toHitAreas(
  boxes: readonly ScreenBox[],
  scale: number,
  w: number,
  h: number,
  exclude?: number,
): HitArea[] {
  const out: HitArea[] = [];
  for (const b of boxes) {
    if (b.id === exclude) continue;
    const x0 = Math.max(0, Math.round(b.x * scale));
    const y0 = Math.max(0, Math.round(b.y * scale));
    const x1 = Math.min(w, Math.round((b.x + b.w) * scale));
    const y1 = Math.min(h, Math.round((b.y + b.h) * scale));
    if (x1 <= x0 || y1 <= y0) continue;
    out.push({ targetId: b.id, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return out;
}

export interface Fit {
  /** Where the image lands inside the box, in box pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Box pixels per image pixel. */
  scale: number;
}

/** Fits an `imgW × imgH` image inside a `boxW × boxH` box, whole image visible, centered (contain). */
export function fitContain(imgW: number, imgH: number, boxW: number, boxH: number): Fit {
  const scale = imgW > 0 && imgH > 0 ? Math.min(boxW / imgW, boxH / imgH) : 0;
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h, scale };
}

/** Default tap slop, in snapshot pixels: about one character width at 960 × 540 (SPEC §12.2). */
export const TAP_SLOP_PX = 32;

/** Distance from a point to a rectangle's edge; 0 inside. */
function rectDistance(a: HitArea, px: number, py: number): number {
  const dx = Math.max(a.x - px, 0, px - (a.x + a.w));
  const dy = Math.max(a.y - py, 0, py - (a.y + a.h));
  return Math.hypot(dx, dy);
}

/**
 * The hit area a tap at (`px`, `py`) snapshot pixels picks: the nearest one within `slop` (0 when the
 * tap is inside), ties broken by the nearest center, then the lowest `targetId`. Never `exclude` (the
 * tipper's own character, in case the host sent it). Null when nothing is close enough.
 */
export function nearestHit(
  hits: readonly HitArea[],
  px: number,
  py: number,
  exclude?: number,
  slop: number = TAP_SLOP_PX,
): HitArea | null {
  let best: HitArea | null = null;
  let bestEdge = Infinity;
  let bestCenter = Infinity;
  for (const a of hits) {
    if (a.targetId === exclude) continue;
    const edge = rectDistance(a, px, py);
    if (edge > slop) continue;
    const center = Math.hypot(a.x + a.w / 2 - px, a.y + a.h / 2 - py);
    if (
      edge < bestEdge ||
      (edge === bestEdge && center < bestCenter) ||
      (edge === bestEdge && center === bestCenter && best !== null && a.targetId < best.targetId)
    ) {
      best = a;
      bestEdge = edge;
      bestCenter = center;
    }
  }
  return best;
}
