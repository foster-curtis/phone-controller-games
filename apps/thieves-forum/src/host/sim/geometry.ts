// Plain geometry on the ground plane, in tiles (SPEC §12.2, §12.3): vectors, rectangles, circle-vs-rect
// push-out (walkable-area collision) and segment-vs-rect tests (line of sight, nav visibility).
// `dist`, `cleanVec` and the point-to-rect helpers are copied from
// apps/fort-frenzy/src/host/sim/geometry.ts (BUILD_PLAN §8: extraction candidate), adapted to the
// content `Rect` shape (x, y, w, h).
import type { Rect, Vec2 } from '../../content/types';

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Input vectors: NaN → 0, −0 → 0 (replays survive JSON), length clamped to 1. */
export function cleanVec(x: number, y: number): Vec2 {
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

/** `r` grown by `pad` on every side. */
export function inflate(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad };
}

export function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** Distance from a point to a rectangle (0 inside). */
export function rectDist(x: number, y: number, r: Rect): number {
  const dx = x < r.x ? r.x - x : x > r.x + r.w ? x - r.x - r.w : 0;
  const dy = y < r.y ? r.y - y : y > r.y + r.h ? y - r.y - r.h : 0;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Pushes a circle out of a rectangle (mutates `p`). Returns true if it moved. A center inside the
 * rectangle leaves by the nearest side.
 */
export function pushOutOfRect(p: { x: number; y: number }, radius: number, r: Rect): boolean {
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  if (p.x + radius <= r.x || p.x - radius >= x1 || p.y + radius <= r.y || p.y - radius >= y1)
    return false;
  const nx = p.x < r.x ? r.x : p.x > x1 ? x1 : p.x;
  const ny = p.y < r.y ? r.y : p.y > y1 ? y1 : p.y;
  const dx = p.x - nx;
  const dy = p.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 > 0) {
    if (d2 >= radius * radius) return false;
    const d = Math.sqrt(d2);
    const k = (radius - d) / d;
    p.x += dx * k;
    p.y += dy * k;
    return true;
  }
  // Center inside: out by the nearest side.
  const left = p.x - r.x;
  const right = x1 - p.x;
  const top = p.y - r.y;
  const bottom = y1 - p.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) p.x = r.x - radius;
  else if (m === right) p.x = x1 + radius;
  else if (m === top) p.y = r.y - radius;
  else p.y = y1 + radius;
  return true;
}

/** Does the segment a→b cross rectangle `r` (touching counts)? Slab test. */
export function segmentHitsRect(ax: number, ay: number, bx: number, by: number, r: Rect): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, ax - r.x) &&
    clip(dx, r.x + r.w - ax) &&
    clip(-dy, ay - r.y) &&
    clip(dy, r.y + r.h - ay) &&
    t0 <= t1
  );
}

/** Smallest signed difference a − b between two angles, in (−π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  else if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}
