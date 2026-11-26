// Clip runtime (SPEC §12.2): samples keyframe tracks per part and blends clips. Pure TS, tested
// headless; rig.ts applies the result to Phaser images. Copied from Fort Frenzy
// (`src/host/render/clip.ts`, glow and order keys dropped): extraction candidate, BUILD_PLAN §8.
// Units: `rot` in degrees (clockwise on screen, y down), `dx`/`dy` in rig units, the rest factors.
import type { Clip, Keyframe } from './types';

export interface PartPose {
  rot: number;
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  alpha: number;
}

export const REST: Readonly<PartPose> = { rot: 0, dx: 0, dy: 0, sx: 1, sy: 1, alpha: 1 };
const FIELDS = ['rot', 'dx', 'dy', 'sx', 'sy', 'alpha'] as const;

export type ClipSample = Map<string, PartPose>;

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
  const parts: ClipSample = new Map();
  for (const [part, keys] of Object.entries(clip.tracks)) {
    const pose = { ...REST };
    for (const f of FIELDS) pose[f] = sampleField(keys, f, t);
    parts.set(part, pose);
  }
  return parts;
}

/** Blends b over a with weight w (0 = a, 1 = b). Parts missing from one side blend with REST. */
export function blendSamples(a: ClipSample, b: ClipSample, w: number): ClipSample {
  if (w >= 1) return b;
  if (w <= 0) return a;
  const parts: ClipSample = new Map();
  for (const name of new Set([...a.keys(), ...b.keys()])) {
    const pa = a.get(name) ?? REST;
    const pb = b.get(name) ?? REST;
    const out = { ...REST };
    for (const f of FIELDS) out[f] = pa[f] + (pb[f] - pa[f]) * w;
    parts.set(name, out);
  }
  return parts;
}
