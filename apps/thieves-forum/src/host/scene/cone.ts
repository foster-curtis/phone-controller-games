// A guard's view cone as the TV draws it (SPEC §6.12, §6.16): range and half-angle around his facing,
// with every ray cut where it meets a line-of-sight blocker (stalls, the stocks, the closed gate), so
// the drawn cone stops at stalls exactly where his sight does. Phaser-free (unit tests); world tiles.
import type { LayoutDef, Rect, Vec2 } from '../../content/types';
import type { GuardView } from '../sim/snapshot';

/** Rays per cone (smooth enough at 1920 × 1080). */
export const CONE_RAYS = 24;

/** Distance along a unit ray from `o` to rect `r`, or Infinity (slab test; inside = 0). */
export function rayRect(o: Vec2, d: Vec2, r: Rect): number {
  let t0 = 0;
  let t1 = Infinity;
  for (const [p, v, lo, hi] of [
    [o.x, d.x, r.x, r.x + r.w],
    [o.y, d.y, r.y, r.y + r.h],
  ] as const) {
    if (Math.abs(v) < 1e-12) {
      if (p < lo || p > hi) return Infinity;
      continue;
    }
    let a = (lo - p) / v;
    let b = (hi - p) / v;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return Infinity;
  }
  return t0;
}

/** The cone polygon: the guard's foot point, then each ray's end, left to right. */
export function conePolygon(
  g: Pick<GuardView, 'x' | 'y' | 'cone'>,
  layout: Pick<LayoutDef, 'blockers' | 'gate'>,
  gateOpen: boolean,
  rays = CONE_RAYS,
): Vec2[] {
  const o = { x: g.x, y: g.y };
  const out: Vec2[] = [o];
  const { dir, range, halfAngle } = g.cone;
  for (let i = 0; i <= rays; i++) {
    const a = dir - halfAngle + (2 * halfAngle * i) / rays;
    const d = { x: Math.cos(a), y: Math.sin(a) };
    let t = range;
    for (const r of layout.blockers) {
      if (gateOpen && r === layout.gate.rect) continue;
      t = Math.min(t, rayRect(o, d, r));
    }
    out.push({ x: o.x + d.x * t, y: o.y + d.y * t });
  }
  return out;
}
