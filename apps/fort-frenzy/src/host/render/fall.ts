// Collapse into a pile (C1 note 4, SPEC §2.4 down, §9.6): every loose part of a rig falls to the
// ground and lies there, turned on its side, in a pile around the foot point. Parts that ride on
// another (glow pieces, color parts, add-ons sharing their parent's joint) stay on it. Pure TS: the
// clip tracks are solved from the rig's views so each part's joint lands on the ground whatever its
// parents do; render code adds the scrap (spawnPile).
import type { Keyframe, Point, RigDef, RigView, ViewId } from '../../themes/types';
import { REST } from './clip';
import { apply, mul, partLocal, type Mat } from './rigMath';
import { splitSets } from './split';
import type { EffectSpawner, ScrapSide } from './types';

/** A stable 0..1 value for a string (FNV-1a, then a finalizer): render randomness is seeded. */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

export interface CollapseOpts {
  /** When the parts start to fall, ms (before it: the dim / stagger). */
  start: number;
  /** One part's fall, ms. */
  fall: number;
  /** Spread of the parts' start times, ms. */
  stagger: number;
  /** How far the pile spreads from the foot, as a fraction of each joint's rest offset. */
  squeeze?: number;
  /** Extra drop below the foot point, sprite units (the Wasp falls from its hover height). */
  drop?: number;
  /** Seed for the scatter (rig id). */
  seed: string;
}

export interface Landing {
  /** Joint position on the ground, sprite units. */
  at: Point;
  /** Rotation on the ground, degrees. */
  rot: number;
}

/** A part rides on its parent (no own track): glow pieces, color parts, add-ons on the same joint. */
export function ridesParent(rv: RigView, name: string): boolean {
  const p = rv.parts[name]!;
  const parent = p.parent ? rv.parts[p.parent] : undefined;
  if (!parent) return false;
  if (p.emissive || p.tint === 'player') return true;
  return Math.hypot(p.pivot[0] - parent.pivot[0], p.pivot[1] - parent.pivot[1]) < 2.5;
}

/** Where a loose part's joint lands and how it lies. */
export function landing(rv: RigView, name: string, opts: CollapseOpts): Landing {
  const p = rv.parts[name]!;
  const [fx, fy] = rv.foot;
  const h1 = hash01(`${opts.seed}:${name}:x`);
  const h2 = hash01(`${opts.seed}:${name}:r`);
  const h3 = hash01(`${opts.seed}:${name}:y`);
  const squeeze = opts.squeeze ?? 0.55;
  const x = fx + (p.pivot[0] - fx) * squeeze + (h1 - 0.5) * 16;
  // Lying parts keep a little height (their thickness), staggered so the pile has depth.
  const y = fy + (opts.drop ?? 0) - 2 - h3 * 5;
  const mag = 62 + h2 * 30;
  const rot = (h2 < 0.5 ? -1 : 1) * mag;
  return { at: [x, y], rot };
}

const RAD = Math.PI / 180;

/** Inverse of a rigid (or scaled) 2D affine. */
function invert(m: Readonly<Mat>): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

/** World matrix that puts `pivot` at `at`, turned `rot` degrees. */
function placed(pivot: Point, l: Landing): Mat {
  return partLocal(pivot, l.at, { ...REST, rot: l.rot });
}

/** Each part's final local pose (rot, dx, dy) for one view: loose parts land, riders follow. */
export function collapsePoses(
  rv: RigView,
  opts: CollapseOpts,
): Map<string, { rot: number; dx: number; dy: number }> {
  const world = new Map<string, Mat>();
  const out = new Map<string, { rot: number; dx: number; dy: number }>();
  const visit = (name: string): Mat => {
    const done = world.get(name);
    if (done) return done;
    const p = rv.parts[name]!;
    const parentW = p.parent && rv.parts[p.parent] ? visit(p.parent) : null;
    let w: Mat;
    if (ridesParent(rv, name)) {
      w = parentW ? mul(parentW, partLocal(p.pivot, p.at, REST)) : partLocal(p.pivot, p.at, REST);
    } else {
      w = placed(p.pivot, landing(rv, name, opts));
      const local = parentW ? mul(invert(parentW), w) : w;
      // local = T(at + d) · R(rot) · T(−pivot): read rot and d back out.
      const rot = Math.atan2(local[1], local[0]) / RAD;
      const [jx, jy] = apply(local, p.pivot[0], p.pivot[1]);
      out.set(name, { rot, dx: jx - p.at[0], dy: jy - p.at[1] });
    }
    world.set(name, w);
    return w;
  };
  for (const name of Object.keys(rv.parts)) visit(name);
  return out;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Collapse tracks for every view and pose of a rig (a part name keeps the first view's solution):
 * each loose part holds still until its staggered start, falls (easing in, so it drops faster as it
 * goes), lands with a small bounce and lies there. Every part gets an alpha track when `fade` is set.
 */
export function collapseTracks(
  def: RigDef,
  opts: CollapseOpts & { fade?: [number, number] },
  /** Solve for one view only (a part's joints differ between views: per-view `<clip>@<view>`). */
  only?: ViewId,
): Record<string, Keyframe[]> {
  const tracks: Record<string, Keyframe[]> = {};
  for (const { view, rv } of splitSets(def.id, def.views, def.viewBox)) {
    if (only && view !== only) continue;
    const poses = collapsePoses(rv, opts);
    for (const [name, f] of poses) {
      if (tracks[name]) continue;
      const t0 = Math.round(opts.start + hash01(`${opts.seed}:${name}:t`) * opts.stagger);
      const t1 = t0 + opts.fall;
      const loose = !rv.parts[name]!.parent;
      tracks[name] = [
        { t: 0, rot: 0, dx: 0, dy: 0 },
        { t: t0, rot: 0, dx: 0, dy: 0 },
        // Easing in: a third of the way at 60% of the time.
        {
          t: Math.round(t0 + opts.fall * 0.6),
          rot: r3(f.rot * 0.4),
          dx: r3(f.dx * 0.3),
          dy: r3(f.dy * 0.3),
        },
        { t: t1, rot: r3(f.rot), dx: r3(f.dx), dy: r3(f.dy) },
        // A small bounce on landing (root parts only: a child's dy runs along its parent's turn).
        ...(loose
          ? [
              { t: t1 + 70, rot: r3(f.rot * 0.97), dx: r3(f.dx), dy: r3(f.dy - 3) },
              { t: t1 + 150, rot: r3(f.rot), dx: r3(f.dx), dy: r3(f.dy) },
            ]
          : []),
      ];
    }
    if (opts.fade) {
      const [a, b] = opts.fade;
      for (const name of Object.keys(rv.parts)) {
        const keys = (tracks[name] ??= []);
        if (keys.some((k) => k.alpha !== undefined)) continue;
        keys.push({ t: a, alpha: 1 }, { t: b, alpha: 0 });
        keys.sort((x, y) => x.t - y.t);
      }
    }
  }
  return tracks;
}

/** When the collapse has landed (scrap spawns then), ms. */
export const landedAt = (opts: CollapseOpts) => opts.start + opts.stagger * 0.5 + opts.fall;

/**
 * When a collapse clip (knight `down`, enemy `death`) has its last part on the ground, ms: the last
 * key that moves a part. Wiring spawns the scrap pile then (FF7 knights, FF10/FF11 enemies).
 */
export function clipLandedMs(clip: { tracks: Record<string, Keyframe[]> }): number {
  let t = 0;
  for (const keys of Object.values(clip.tracks))
    for (const k of keys) if (k.rot !== undefined || k.dy !== undefined) t = Math.max(t, k.t);
  return t;
}

/**
 * The scrap under a collapsed pile: a small piece behind the parts and one in front (seeded
 * offsets). `big` uses the structure-sized pieces (the Colossus, Brute, Bombard). `holdMs` keeps
 * them for the down timer (knights) before they fade.
 */
export function spawnPile(
  fx: EffectSpawner,
  side: ScrapSide,
  sx: number,
  sy: number,
  unitPx: number,
  opts: { big?: boolean; holdMs?: number; seed?: string } = {},
) {
  const seed = opts.seed ?? side;
  // One piece to each side of the pile, so the scrap shows past the fallen parts.
  const reach = (opts.big ? 2 : 1) * unitPx;
  const off = (k: string, dir: 1 | -1) => dir * (16 + hash01(`${seed}:${k}`) * 16) * reach;
  const small = opts.big ? 4 : 1;
  fx.scrap(side, small as 1 | 4, sx + off('a', -1), sy - 2, opts.holdMs);
  fx.scrap(side, (small + 1) as 2 | 5, sx + off('b', 1), sy + 3, opts.holdMs);
}
