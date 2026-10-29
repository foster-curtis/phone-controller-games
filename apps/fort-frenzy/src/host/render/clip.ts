// Clip runtime (SPEC §15.2): samples keyframe tracks per part and blends clips. Pure TS, so it is
// tested headless; rig.ts applies the result to Phaser images.
// Keyframe units: `rot` in degrees (clockwise on screen, the art's y-down space), `dx`/`dy` in
// sprite units, `sx`/`sy`/`alpha`/`glow` as factors.
import type { Clip, Keyframe } from '../../themes/types';

export interface PartPose {
  rot: number;
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  alpha: number;
  glow: number;
}

export const REST: Readonly<PartPose> = { rot: 0, dx: 0, dy: 0, sx: 1, sy: 1, alpha: 1, glow: 1 };
const FIELDS = ['rot', 'dx', 'dy', 'sx', 'sy', 'alpha', 'glow'] as const;

export interface ClipSample {
  parts: Map<string, PartPose>;
  /** The latest `order` key at or before t (Colossus legs), or null. */
  order: string[] | null;
}

/** Clip-local time for a playhead (loops wrap, one-shots clamp). */
export function clipTime(clip: Clip, t: number): number {
  if (clip.durationMs <= 0) return 0;
  if (clip.loop) return ((t % clip.durationMs) + clip.durationMs) % clip.durationMs;
  return Math.max(0, Math.min(clip.durationMs, t));
}

/** One field of a track at time t: linear between the keys that set it, held past the ends. */
function sampleField(keys: readonly Keyframe[], field: (typeof FIELDS)[number], t: number) {
  let before: Keyframe | undefined;
  let after: Keyframe | undefined;
  for (const k of keys) {
    if (k[field] === undefined) continue;
    if (k.t <= t) before = k;
    else if (!after) after = k;
  }
  if (!before && !after) return REST[field];
  if (!before) return after![field]!;
  if (!after || after.t === before.t) return before[field]!;
  const u = (t - before.t) / (after.t - before.t);
  return before[field]! + (after[field]! - before[field]!) * u;
}

export function sampleClip(clip: Clip, playheadMs: number): ClipSample {
  const t = clipTime(clip, playheadMs);
  const parts = new Map<string, PartPose>();
  let order: string[] | null = null;
  let orderT = -Infinity;
  for (const [part, keys] of Object.entries(clip.tracks)) {
    const pose = { ...REST };
    for (const f of FIELDS) pose[f] = sampleField(keys, f, t);
    parts.set(part, pose);
    for (const k of keys) {
      if (k.order && k.t <= t && k.t >= orderT) {
        order = k.order;
        orderT = k.t;
      }
    }
  }
  return { parts, order };
}

/** Blends b over a with weight w (0 = a, 1 = b). Parts missing from one side blend with REST. */
export function blendSamples(a: ClipSample, b: ClipSample, w: number): ClipSample {
  if (w >= 1) return b;
  if (w <= 0) return a;
  const parts = new Map<string, PartPose>();
  for (const name of new Set([...a.parts.keys(), ...b.parts.keys()])) {
    const pa = a.parts.get(name) ?? REST;
    const pb = b.parts.get(name) ?? REST;
    const out = { ...REST };
    for (const f of FIELDS) out[f] = pa[f] + (pb[f] - pa[f]) * w;
    parts.set(name, out);
  }
  return { parts, order: w < 0.5 ? a.order : b.order };
}

/**
 * Applies a per-key `order` to a base draw order: the named parts take the slots those same parts
 * hold in the base order, in the key's sequence (the Colossus swaps its legs mid-stride).
 */
export function applyOrder(base: readonly string[], swap: readonly string[] | null): string[] {
  if (!swap || swap.length === 0) return [...base];
  const named = new Set(swap.filter((p) => base.includes(p)));
  const queue = swap.filter((p) => named.has(p));
  return base.map((p) => (named.has(p) ? queue.shift()! : p));
}
