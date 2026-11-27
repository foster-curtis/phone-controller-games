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

/**
 * Side gait (facing right): legs scissor about their baked angle, each arm swings against the leg
 * on its side (positive `rot` takes a hanging limb backward).
 */
export function gaitSide(ms: number, p: GaitParts, o: GaitOpts): Tracks {
  const baked = o.baked ?? 14;
  return {
    'leg-l': wave(ms, 8, (u) => ({ rot: o.legs * sin(u) - baked })),
    'leg-r': wave(ms, 8, (u) => ({ rot: baked - o.legs * sin(u) })),
    'arm-l': wave(ms, 8, (u) => ({ rot: -o.arms * sin(u) })),
    'arm-r': wave(ms, 8, (u) => ({ rot: o.arms * sin(u) })),
    [p.root]: wave(ms, 8, (u) => ({ dy: -o.bob * Math.abs(sin(u)) })),
  };
}

export interface RunOpts {
  /** Leg swing about vertical, degrees. */
  legs: number;
  /** Arm pump, degrees (side) or foreshortening (front/back, as a fraction of length). */
  arms: number;
  /** Body bob, rig units (two per cycle: a flight phase each step). */
  bob: number;
  /** Forward lean, degrees (side) of the body root. */
  lean: number;
  /** Side legs' baked angle. */
  baked?: number;
  /** How much a leg shortens and lifts while it swings forward (the knee comes up), 0–1. */
  tuck?: number;
}

/**
 * Side run (TF1-fix-1, user C1 note 3): a real running cycle. Each leg traces a loop, a "pedal":
 * pushing back long and low on the ground, then tucked (shorter, lifted) while it swings forward.
 * The body leans forward; the arms pump at the side, opposite their leg, a little shorter on the
 * forward swing (a bent elbow, as far as one-piece arms allow).
 */
export function runSide(ms: number, p: GaitParts, o: RunOpts): Tracks {
  const baked = o.baked ?? 14;
  const tuck = o.tuck ?? 0.22;
  const cos = (u: number, phase = 0) => Math.cos((u + phase) * TAU);
  // Far leg: angle +legs·sin (positive = back); it swings forward while cos < 0.
  const leg = (u: number, sign: 1 | -1, off: number) => {
    const swing = Math.max(0, -sign * cos(u));
    return {
      rot: sign * o.legs * sin(u) + off,
      sy: 1 - tuck * swing,
      dy: -3 * tuck * swing,
    };
  };
  return {
    'leg-l': wave(ms, 12, (u) => leg(u, 1, -baked)),
    'leg-r': wave(ms, 12, (u) => leg(u, -1, baked)),
    'arm-l': wave(ms, 12, (u) => ({
      rot: -o.arms * sin(u) - 6,
      sy: 1 - 0.12 * Math.max(0, sin(u)),
    })),
    'arm-r': wave(ms, 12, (u) => ({
      rot: o.arms * sin(u) - 6,
      sy: 1 - 0.12 * Math.max(0, -sin(u)),
    })),
    [p.root]: wave(ms, 12, (u) => ({ rot: o.lean, dy: -o.bob * Math.abs(sin(u)) })),
  };
}

/**
 * Front/back run (TF1-fix-1): the legs pedal toward and away from the camera, so they lift and
 * foreshorten in turn (a quarter phase between the lift and the shortening), the body leans in (head
 * dipped, torso a touch shorter), and the arms pump at the sides by foreshortening, not by swinging
 * across the body.
 */
export function runFront(ms: number, p: GaitParts, o: RunOpts): Tracks {
  const lift = o.legs / 9;
  const leg = (u: number) => ({
    dy: -lift * Math.max(0, sin(u)),
    sy: 1 - (o.tuck ?? 0.22) * Math.max(0, sin(u, -0.125)),
  });
  return {
    'leg-l': wave(ms, 12, (u) => leg(u)),
    'leg-r': wave(ms, 12, (u) => leg(u + 0.5)),
    // Each arm comes forward (shorter) with the opposite leg's lift.
    'arm-l': wave(ms, 12, (u) => ({ rot: 4 + 2 * sin(u), sy: 1 - o.arms * (0.5 - 0.5 * sin(u)) })),
    'arm-r': wave(ms, 12, (u) => ({
      rot: -4 - 2 * sin(u),
      sy: 1 - o.arms * (0.5 + 0.5 * sin(u)),
    })),
    [p.root]: wave(ms, 12, (u) => ({ dy: -o.bob * Math.abs(sin(u)), sy: 0.97 })),
    [p.head]: hold({ dy: o.lean / 10 }),
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

/**
 * A staged glance (TF1-fix-1, user C1 note 1; SPEC §6.6, §6.8): the rigs are 2D cut-outs of a 3D
 * figure, so the wind-up turns the head alone to the turned view (side head on a front or back body,
 * front head on a side body), the look turns the whole body that way, and the glance back returns
 * the body first, then the head. Shared by the merchant and the citizen (NPCs catching pickpockets).
 */
export function glanceClips(
  p: GaitParts,
  ms: { windup: number; look: number; back: number },
): { glanceWindup: Clip; glanceLook: Clip; glanceBack: Clip } {
  const half = Math.round(ms.back / 2);
  return {
    glanceWindup: {
      ...once(ms.windup, {
        [p.head]: keys([0, { rot: 0, dy: 0 }], [ms.windup, { rot: 4, dy: -0.3 }]),
      }),
      stages: [{ t: 0, parts: { [p.head]: { view: 'turn' } } }],
    },
    glanceLook: { ...loop(ms.look, breathe(ms.look, p, 0.3)), stages: [{ t: 0, body: 'turn' }] },
    glanceBack: {
      ...once(ms.back, { [p.head]: keys([0, { rot: 4 }], [half, { rot: 0 }]) }),
      stages: [{ t: 0, parts: { [p.head]: { view: 'turn' } } }, { t: half }],
    },
  };
}

/**
 * Front and back views point into / out of the screen (TF1-fix-1, user C1 note 7): the delivered
 * sideways point arm (shoulder 12, 30.5 → finger 0.8, 29.3) turned along the screen's vertical and
 * foreshortened. In the 3/4 top-down view what's in front of a character is lower on screen, so
 * pointing at the camera angles down over the chest and pointing away angles up past the shoulder.
 */
export const POINT_OUT = { rot: -120, sx: 0.6 } as const;
export const POINT_IN = { rot: 66, sx: 0.6 } as const;
