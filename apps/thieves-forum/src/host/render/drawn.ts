// What a rig draws at one moment of a clip (SPEC §12.2, §6.6, §6.8, §6.21; TF1-fix-1): the body's
// view and pose, per-part art overrides from another view or pose (a glance turns the head alone
// before the body), and draw-order moves (a raised near arm in front of the head). Pure, so tests
// sample frames headless; rig.ts rebuilds its images only when the result's `key` changes.
import { clipTime, sampleClip } from './clip';
import { composePose, type Mat } from './rigMath';
import type { Clip, ClipStage, RigDef, RigPart, RigPose, ViewId, ViewRef } from './types';

/** The view a glance turns to: side from front or back, front from side (user note, C1). */
export function turnView(view: ViewId): ViewId {
  return view === 'side' ? 'front' : 'side';
}

const resolveView = (ref: ViewRef | undefined, from: ViewId): ViewId =>
  ref === undefined ? from : ref === 'turn' ? turnView(from) : ref;

export interface PartFrom {
  view: ViewId;
  pose: string;
}

export interface DrawnPose {
  /** The view the body is drawn in (the facing view unless a stage turns it). */
  body: ViewId;
  /** The body's pose in that view. */
  pose: string;
  /** The effective part set: overridden parts carry their own view's pivots, joined at this view's. */
  rp: RigPose;
  /** Where each part's art comes from (its manifest frame is `<rig>/<view>/<pose>/<part>`). */
  from: Record<string, PartFrom>;
  /** Identity of the drawing: equal keys draw the same images. */
  key: string;
}

/** The stage in force at clip time t (stages sorted by t), or null. */
export function stageAt(clip: Clip | undefined, t: number): { i: number; s: ClipStage } | null {
  const stages = clip?.stages;
  if (!stages || stages.length === 0) return null;
  const ct = clipTime(clip, t);
  let hit: { i: number; s: ClipStage } | null = null;
  stages.forEach((s, i) => {
    if (s.t <= ct) hit = { i, s };
  });
  return hit;
}

/** The part and every part under it (by `parent`). */
function subtree(rp: RigPose, root: string): string[] {
  const out = [root];
  for (let i = 0; i < out.length; i++)
    for (const [name, p] of Object.entries(rp.parts))
      if (p.parent === out[i] && !out.includes(name)) out.push(name);
  return out;
}

function compute(def: RigDef, view: ViewId, clip: Clip | undefined, st: ClipStage | null) {
  const body = resolveView(st?.body, view);
  const bv = def.views[body];
  const pose = clip?.pose && bv.poses[clip.pose] ? clip.pose : bv.defaultPose;
  const base = bv.poses[pose]!;
  const parts: Record<string, RigPart> = { ...base.parts };
  const attach = { ...base.attach };
  const from: Record<string, PartFrom> = {};
  for (const name of Object.keys(parts)) from[name] = { view: body, pose };
  const notes: string[] = [];
  for (const [root, ref] of Object.entries(st?.parts ?? {})) {
    if (!base.parts[root]) continue;
    const pv = resolveView(ref.view, body);
    const vv = def.views[pv];
    const pp =
      ref.pose && vv.poses[ref.pose]
        ? ref.pose
        : pv === body
          ? vv.defaultPose
          : vv.poses[pose]
            ? pose
            : vv.defaultPose;
    const other = vv.poses[pp]!;
    const names = subtree(base, root);
    for (const name of names) {
      const mine = base.parts[name]!;
      const theirs = other.parts[name];
      parts[name] = !theirs
        ? { ...mine, src: null }
        : name === root
          ? // Joined at this view's joint on the (unchanged) parent.
            { ...theirs, parent: mine.parent, at: mine.at ?? mine.pivot }
          : theirs;
      from[name] = { view: pv, pose: pp };
    }
    for (const [a, def0] of Object.entries(other.attach))
      if (names.includes(def0.part) && other.parts[def0.part]?.src) attach[a] = def0;
    notes.push(`${root}:${pv}/${pp}`);
  }
  let order = [...base.order];
  for (const [name, after] of Object.entries(clip?.reorder ?? {})) {
    if (!order.includes(name) || (after !== 'top' && !order.includes(after))) continue;
    order = order.filter((n) => n !== name);
    if (after === 'top') order.push(name);
    else order.splice(order.indexOf(after) + 1, 0, name);
  }
  const rp: RigPose = { file: base.file, parts, order, attach };
  const key = `${body}|${pose}|${notes.join(',')}|${order.join(',')}`;
  return { body, pose, rp, from, key };
}

const cache = new WeakMap<RigDef, WeakMap<Clip, Map<string, DrawnPose>>>();
const noClip: Clip = { durationMs: 0, loop: false, tracks: {} };

/** The drawing for `clip` at playhead t (ms) on a rig facing `view`. Cached per clip and stage. */
export function drawnPose(def: RigDef, view: ViewId, clip: Clip | undefined, t = 0): DrawnPose {
  const st = stageAt(clip, t);
  let byClip = cache.get(def);
  if (!byClip) cache.set(def, (byClip = new WeakMap()));
  const c = clip ?? noClip;
  let byKey = byClip.get(c);
  if (!byKey) byClip.set(c, (byKey = new Map()));
  const k = `${view}|${st?.i ?? -1}`;
  let d = byKey.get(k);
  if (!d) byKey.set(k, (d = compute(def, view, clip, st?.s ?? null)));
  return d;
}

/** One sampled frame: the drawing and every part's matrix (rig units). For tests and tools. */
export function sampleFrame(
  def: RigDef,
  view: ViewId,
  clip: Clip,
  t: number,
): { drawn: DrawnPose; mats: Map<string, Mat>; sample: ReturnType<typeof sampleClip> } {
  const drawn = drawnPose(def, view, clip, t);
  const sample = sampleClip(clip, t);
  return { drawn, mats: composePose(drawn.rp, sample), sample };
}
