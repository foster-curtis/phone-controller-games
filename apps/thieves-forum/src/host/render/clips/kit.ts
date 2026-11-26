// Helpers for authoring clips in render/clips/<rig>.ts (SPEC §12.2, §6.21): keyframe tracks sampled
// from periodic functions, and the gait cycles the three rigs share. Adapted from Fort Frenzy
// (`src/host/render/clipKit.ts`): extraction candidate, BUILD_PLAN §8.
// Part names follow the rigs (art/forum/rigs/*.json): `-l` / `-r` are viewer-relative in front and
// back views; in side views (facing right) `-l` is the far limb. Side-view legs are drawn mid-stride
// (±14°), so side gaits rotate them about that baked angle. Positive `rot` is clockwise on screen.
import type { Clip, Keyframe } from '../types';

export type KeyValues = Omit<Keyframe, 't'>;
export type Tracks = Record<string, Keyframe[]>;

const TAU = Math.PI * 2;
export const sin = (u: number, phase = 0) => Math.sin((u + phase) * TAU);

/** A track sampled at `steps` + 1 evenly spaced keys over `ms` (the last key closes a loop). */
export function wave(ms: number, steps: number, fn: (u: number) => KeyValues): Keyframe[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const u = i / steps;
    const v = fn(u);
    const out: Keyframe = { t: Math.round(u * ms) };
    for (const [k, n] of Object.entries(v) as [keyof KeyValues, number][])
      out[k] = Math.round(n * 1000) / 1000;
    return out;
  });
}

/** A held value. */
export const hold = (v: KeyValues): Keyframe[] => [{ t: 0, ...v }];

export const loop = (durationMs: number, ...tracks: Tracks[]): Clip => ({
  durationMs,
  loop: true,
  tracks: Object.assign({}, ...tracks) as Tracks,
});

export const once = (durationMs: number, ...tracks: Tracks[]): Clip => ({
  durationMs,
  loop: false,
  tracks: Object.assign({}, ...tracks) as Tracks,
});

/** The same clip with a pose override and optional groups. */
export const posed = (clip: Clip, pose: string, groups?: string[]): Clip => ({
  ...clip,
  pose,
  ...(groups ? { groups } : {}),
});

export const withGroups = (clip: Clip, groups: string[]): Clip => ({ ...clip, groups });

/** Body parts a gait moves. `root` carries the body; its children follow. */
export interface GaitParts {
  root: string;
  head: string;
}

/** Breathing: the root bobs a little. */
export function breathe(ms: number, p: GaitParts, amp = 0.5): Tracks {
  return {
    [p.root]: wave(ms, 8, (u) => ({ dy: amp * (0.5 - 0.5 * Math.cos(u * TAU)) })),
  };
}

export interface GaitOpts {
  /** Leg swing, degrees. */
  legs: number;
  /** Arm swing, degrees. */
  arms: number;
  /** Body bob, rig units (two bobs per cycle). */
  bob: number;
  /** Side legs' baked angle (±14 in base poses, ±24 in the run pose). */
  baked?: number;
}

/** Front/back gait: legs lift alternately (foreshortened), arms swing, the body bobs. */
export function gaitFront(ms: number, p: GaitParts, o: GaitOpts): Tracks {
  const lift = o.legs / 12;
  return {
    'leg-l': wave(ms, 8, (u) => ({
      dy: -lift * Math.max(0, sin(u)),
      sy: 1 - 0.06 * Math.max(0, sin(u)),
    })),
    'leg-r': wave(ms, 8, (u) => ({
      dy: -lift * Math.max(0, -sin(u)),
      sy: 1 - 0.06 * Math.max(0, -sin(u)),
    })),
    'arm-l': wave(ms, 8, (u) => ({ rot: o.arms * 0.5 * sin(u) })),
    'arm-r': wave(ms, 8, (u) => ({ rot: o.arms * 0.5 * sin(u) })),
    [p.root]: wave(ms, 8, (u) => ({ dy: -o.bob * Math.abs(sin(u)) })),
  };
}

/** Side gait (facing right): legs scissor about their baked angle, arms swing opposite. */
export function gaitSide(ms: number, p: GaitParts, o: GaitOpts): Tracks {
  const baked = o.baked ?? 14;
  return {
    'leg-l': wave(ms, 8, (u) => ({ rot: o.legs * sin(u) - baked })),
    'leg-r': wave(ms, 8, (u) => ({ rot: baked - o.legs * sin(u) })),
    'arm-l': wave(ms, 8, (u) => ({ rot: o.arms * sin(u) })),
    'arm-r': wave(ms, 8, (u) => ({ rot: -o.arms * sin(u) })),
    [p.root]: wave(ms, 8, (u) => ({ dy: -o.bob * Math.abs(sin(u)) })),
  };
}

/** Side idle: legs straightened under the body. */
export const sideStand = (baked = 14): Tracks => ({
  'leg-l': hold({ rot: -baked }),
  'leg-r': hold({ rot: baked }),
});

/** Keys from (t, values) pairs. */
export const keys = (...pairs: [number, KeyValues][]): Keyframe[] =>
  pairs.map(([t, v]) => ({ t, ...v }));
