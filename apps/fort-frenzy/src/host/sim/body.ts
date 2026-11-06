// Enemy body hitboxes (SPEC §9, §15.3; C4, FF10-fix-2): what our attacks hit. In the §2.5 view a
// body drawn h tiles above its feet covers the ground h / 0.6 tiles up the screen (−y), so an aim
// line or cone crossing a drawn head crosses that ground. The hitbox is the content's body circle
// swept up the screen over its drawn span: a capsule on the ground, from `lo` to `hi` tiles north
// of the feet, of radius `r`. Feet circles (`Unit.r`) still walk, collide and take enemy hits.
// Leaf module: plain math, no allocation per test (the projectile step runs it per candidate).
import type { EnemyDef } from '../../content/types';
import { GROUND_SQUASH } from '../../shared/projection';
import { inSector, type Sector } from './classes/sector';

export interface GroundBody {
  /** Radius, tiles. */
  r: number;
  /** The capsule's segment, tiles north of the feet: `lo` (near end) to `hi` (≥ lo). */
  lo: number;
  hi: number;
}

/** The ground capsule of a content body: its caps reach the drawn top and r below the drawn bottom. */
export function groundBody(b: NonNullable<EnemyDef['body']>): GroundBody {
  const lo = b.bottom / GROUND_SQUASH;
  return { r: b.radius, lo, hi: Math.max(lo, b.top / GROUND_SQUASH - b.radius) };
}

/** Where to aim at a body (auto-aim, towers): its near end, the feet for anything on the ground. */
export function bodyAimY(y: number, b: GroundBody): number {
  return y - b.lo;
}

/**
 * The shot segment (x0, y0) + t·(sx, sy), t in 0..1, against the body of an enemy standing at
 * (ex, ey), padded by the shot's radius: the t of closest approach on a hit, else −1 (closest points
 * of two segments, Ericson §5.1.9; the body's segment runs straight up, −y).
 */
export function segmentHitsBody(
  x0: number,
  y0: number,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  b: GroundBody,
  pad: number,
): number {
  const qy = ey - b.lo;
  const len = b.hi - b.lo;
  // d1 = (sx, sy), d2 = (0, −len), w = P0 − Q0.
  const wx = x0 - ex;
  const wy = y0 - qy;
  const a = sx * sx + sy * sy;
  const e = len * len;
  const f = -len * wy;
  let s: number;
  let t: number;
  if (a <= 1e-12) {
    s = 0;
    t = e <= 1e-12 ? 0 : clamp01(f / e);
  } else {
    const c = sx * wx + sy * wy;
    if (e <= 1e-12) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const bb = -sy * len;
      const denom = a * e - bb * bb;
      s = denom > 1e-12 ? clamp01((bb * f - c * e) / denom) : 0;
      t = (bb * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((bb - c) / a);
      }
    }
  }
  const dx = x0 + sx * s - ex;
  const dy = y0 + sy * s - (qy - len * t);
  const rr = b.r + pad;
  return dx * dx + dy * dy <= rr * rr ? s : -1;
}

/** Does a ground circle (cx, cy, radius) reach the body of an enemy at (ex, ey)? */
export function circleHitsBody(
  cx: number,
  cy: number,
  radius: number,
  ex: number,
  ey: number,
  b: GroundBody,
): boolean {
  const top = ey - b.hi;
  const near = ey - b.lo;
  const py = cy < top ? top : cy > near ? near : cy;
  const dx = cx - ex;
  const dy = cy - py;
  const rr = radius + b.r;
  return dx * dx + dy * dy <= rr * rr;
}

/**
 * Does a sector (arcs, cones) reach the body of an enemy at (ex, ey)? The capsule is tested as
 * circles of radius r along its segment (`inSector`, the feet test's), at most r / 4 apart: they
 * cover it to within 0.01 r. Bodies out of reach of the apex are rejected first.
 */
export function sectorHitsBody(sec: Sector, ex: number, ey: number, b: GroundBody): boolean {
  const near = ey - b.lo;
  const top = ey - b.hi;
  const cy = sec.y < top ? top : sec.y > near ? near : sec.y;
  const dx = ex - sec.x;
  const dy = cy - sec.y;
  const rr = sec.range + b.r;
  if (dx * dx + dy * dy > rr * rr) return false;
  const len = b.hi - b.lo;
  const n = len > 0 ? Math.ceil((4 * len) / b.r) : 0;
  for (let k = 0; k <= n; k++) {
    const y = n === 0 ? near : near - (len * k) / n;
    if (inSector(sec, ex, y, b.r)) return true;
  }
  return false;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
