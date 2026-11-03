// Rig composition math (SPEC §15.2 "Composing a rig"): each part turns about its pivot, chained
// through its parents. All in the rig's sprite units (the shared viewBox); pure, so it's tested
// headless.
import type { Point, RigView } from '../../themes/types';
import { REST, type PartPose } from './clip';

/** 2D affine [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Mat = [number, number, number, number, number, number];

export const IDENTITY: Readonly<Mat> = [1, 0, 0, 1, 0, 0];

export function mul(m: Readonly<Mat>, n: Readonly<Mat>): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function apply(m: Readonly<Mat>, x: number, y: number): Point {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** T(at + d) · R(rot) · S(sx, sy) · T(−pivot): at rest (at = pivot) this is the identity. */
export function partLocal(pivot: Point, at: Point, p: PartPose): Mat {
  const r = (p.rot * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const a = cos * p.sx;
  const b = sin * p.sx;
  const c = -sin * p.sy;
  const d = cos * p.sy;
  return [
    a,
    b,
    c,
    d,
    at[0] + p.dx - (a * pivot[0] + c * pivot[1]),
    at[1] + p.dy - (b * pivot[0] + d * pivot[1]),
  ];
}

/** Every part's matrix in rig units, parents first (cycles were rejected by the atlas check). */
export function composeView(view: RigView, poses: ReadonlyMap<string, PartPose>): Map<string, Mat> {
  const out = new Map<string, Mat>();
  const visit = (name: string): Mat => {
    const done = out.get(name);
    if (done) return done;
    const part = view.parts[name];
    if (!part) return IDENTITY as Mat;
    const local = partLocal(part.pivot, part.at, poses.get(name) ?? REST);
    const m = part.parent && view.parts[part.parent] ? mul(visit(part.parent), local) : local;
    out.set(name, m);
    return m;
  };
  for (const name of Object.keys(view.parts)) visit(name);
  return out;
}

/** Position of the pivot, rotation (radians) and scale for a sprite whose origin is the pivot. */
export function decompose(
  m: Readonly<Mat>,
  pivot: Point,
): {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
} {
  const [x, y] = apply(m, pivot[0], pivot[1]);
  const scaleX = Math.hypot(m[0], m[1]);
  const rotation = Math.atan2(m[1], m[0]);
  const scaleY = scaleX === 0 ? 0 : (m[0] * m[3] - m[1] * m[2]) / scaleX;
  return { x, y, rotation, scaleX, scaleY };
}

/** A point riding on a part (rig units, rest pose `at`) under the composed matrices; null if unknown. */
export function partPoint(
  view: RigView,
  mats: ReadonlyMap<string, Mat>,
  part: string,
  at: Point,
): Point | null {
  if (!view.parts[part]) return null;
  const m = mats.get(part);
  return m ? apply(m, at[0], at[1]) : [at[0], at[1]];
}

/** A named attach point (§15.2) under the composed matrices, in rig units; null if the view has none. */
export function attachPoint(
  view: RigView,
  mats: ReadonlyMap<string, Mat>,
  name: string,
): Point | null {
  const a = view.attach?.[name];
  if (!a) return null;
  const m = mats.get(a.part);
  return m ? apply(m, a.at[0], a.at[1]) : [a.at[0], a.at[1]];
}
