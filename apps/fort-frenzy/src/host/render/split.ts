// Render-side part splits (C1 note 3, BUILD_PLAN §8 FF3-fix-1): the knights' front and back views
// draw both legs as one `legs` part (and one `legs-glow`). The renderer draws that frame twice,
// cropped at the crotch into two halves (screen left and right), so clips move each leg on its own
// and swap which one is in front. The art stays as is; pure TS, tested headless.
import type { Point, RigPart, RigView, ViewId } from '../../themes/types';

/** Half-width of the overlap at the cut, sprite units: each half keeps the shared ink edge. */
const OVERLAP = 1;
/** Hip offset from the cut, sprite units (each leg turns about its own hip). */
const HIP = 6;

/** Parts split at the first one's pivot x (the leg and its glow piece). */
const LEGS = ['legs', 'legs-glow'] as const;
const SPLIT: Readonly<Record<string, Partial<Record<ViewId, readonly string[]>>>> = {
  warden: { front: LEGS, back: LEGS },
  ranger: { front: LEGS, back: LEGS },
  commander: { front: LEGS, back: LEGS },
  artificer: { front: LEGS, back: LEGS },
};

export type Side = 'l' | 'r';
/**
 * A half's part name: `legs.l` / `legs.r` in the front view, `legs.bl` / `legs.br` in the back view
 * (a step lifts the leg moving toward the camera in front and away from it in back, so the two
 * views need their own tracks).
 */
export const half = (part: string, side: Side, view: ViewId = 'front') =>
  `${part}.${view === 'back' ? 'b' : ''}${side}`;

/** Crop in sprite units along x: [x0, x1]. */
export type CropX = [number, number];

export interface SplitResult {
  rv: RigView;
  crops: Map<string, CropX>;
}

/** Every split part name a rig can have (clips may name them; rig-contract test). */
export function splitPartNames(rigId: string): string[] {
  const out: string[] = [];
  for (const [view, parts] of Object.entries(SPLIT[rigId] ?? {}) as [ViewId, string[]][])
    for (const p of parts) for (const s of ['l', 'r'] as const) out.push(half(p, s, view));
  return out;
}

/**
 * The view with each split part replaced by its two halves: same frame, cropped at the first split
 * part's pivot x, each pivoting at its own hip. The halves take the first split part's slot in the
 * order: `legs.l, legs-glow.l, legs.r, legs-glow.r`. Children follow the half their pivot is on.
 */
export function splitView(
  rigId: string,
  view: ViewId,
  rv: RigView,
  viewBox: readonly [number, number, number, number],
): SplitResult {
  const names = (SPLIT[rigId]?.[view] ?? []).filter((p) => rv.parts[p]);
  const crops = new Map<string, CropX>();
  if (names.length === 0) return { rv, crops };
  const cut = rv.parts[names[0]!]!.pivot[0];
  const split = new Set(names);
  const sideOf = (x: number): Side => (x < cut ? 'l' : 'r');
  const parts: Record<string, RigPart> = {};
  for (const [name, p] of Object.entries(rv.parts)) {
    if (!split.has(name)) {
      const parent =
        p.parent && split.has(p.parent) ? half(p.parent, sideOf(p.pivot[0]), view) : p.parent;
      parts[name] = { ...p, ...(parent ? { parent } : {}) };
      continue;
    }
    for (const side of ['l', 'r'] as const) {
      const dx = side === 'l' ? -HIP : HIP;
      const pivot: Point = [p.pivot[0] + dx, p.pivot[1]];
      const at: Point = [p.at[0] + dx, p.at[1]];
      const parent = p.parent && split.has(p.parent) ? half(p.parent, side, view) : p.parent;
      const name2 = half(name, side, view);
      parts[name2] = { ...p, pivot, at, ...(parent ? { parent } : {}) };
      crops.set(
        name2,
        side === 'l' ? [viewBox[0], cut + OVERLAP] : [cut - OVERLAP, viewBox[0] + viewBox[2]],
      );
    }
  }
  const inOrder = rv.order.filter((o) => split.has(o));
  const order: string[] = [];
  for (const name of rv.order) {
    if (!split.has(name)) order.push(name);
    else if (name === inOrder[0])
      for (const side of ['l', 'r'] as const)
        for (const n of inOrder) order.push(half(n, side, view));
  }
  const attach = rv.attach
    ? Object.fromEntries(
        Object.entries(rv.attach).map(([k, a]) => [
          k,
          split.has(a.part) ? { ...a, part: half(a.part, sideOf(a.at[0]), view) } : a,
        ]),
      )
    : undefined;
  return { rv: { ...rv, parts, order, ...(attach ? { attach } : {}) }, crops };
}

/** Every part set of a rig with splits applied, by view (posed views: default pose first). */
export function splitSets(
  rigId: string,
  views: Partial<Record<ViewId, RigView | { poses: Record<string, RigView>; defaultPose: string }>>,
  viewBox: readonly [number, number, number, number],
): { view: ViewId; rv: RigView }[] {
  const out: { view: ViewId; rv: RigView }[] = [];
  for (const view of ['side', 'front', 'back'] as const) {
    const v = views[view];
    if (!v) continue;
    const sets =
      'poses' in v
        ? Object.entries(v.poses)
            .sort(([a], [b]) => Number(b === v.defaultPose) - Number(a === v.defaultPose))
            .map(([, rv]) => rv)
        : [v];
    for (const rv of sets) out.push({ view, rv: splitView(rigId, view, rv, viewBox).rv });
  }
  return out;
}
