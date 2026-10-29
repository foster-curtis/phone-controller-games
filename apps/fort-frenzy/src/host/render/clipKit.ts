// Helpers for authoring clips in render/clips/<rig>.ts (SPEC §15.2): keyframe tracks sampled from
// periodic functions, plus the knights' shared hit / down / respawn (§2.4). Tracks may name parts
// from every view; a view ignores the parts it doesn't have.
import type { Clip, Keyframe } from '../../themes/types';

export type KeyValues = Omit<Keyframe, 't' | 'order'>;
export type Tracks = Record<string, Keyframe[]>;

const TAU = Math.PI * 2;
export const sin = (u: number, phase = 0) => Math.sin((u + phase) * TAU);

/** A track sampled at `steps` + 1 evenly spaced keys over `ms` (the last key closes a loop). */
export function wave(ms: number, steps: number, fn: (u: number) => KeyValues): Keyframe[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const u = i / steps;
    return { t: Math.round(u * ms), ...round(fn(u)) };
  });
}

function round(v: KeyValues): KeyValues {
  const out: KeyValues = {};
  for (const [k, n] of Object.entries(v) as [keyof KeyValues, number][]) {
    out[k] = Math.round(n * 1000) / 1000;
  }
  return out;
}

/** The same track for several parts. */
export function each(parts: readonly string[], track: Keyframe[]): Tracks {
  return Object.fromEntries(parts.map((p) => [p, track]));
}

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

/** Breathing idle: the root bobs a little and the head follows. */
export function idleBob(ms: number, roots: readonly string[], amp = 1.2, extra: Tracks = {}): Clip {
  return loop(
    ms,
    each(
      roots,
      wave(ms, 8, (u) => ({ dy: amp * (0.5 - 0.5 * Math.cos(u * TAU)) })),
    ),
    extra,
  );
}

export interface KnightParts {
  /** The root part (torso), whose children follow. */
  root: string;
  /** Leg parts by side, across views (side view: back/front leg; front/back: legs). */
  legBack: readonly string[];
  legFront: readonly string[];
  /** Single leg parts in front/back views (squash bob). */
  legsBoth: readonly string[];
  /** Arm or weapon-hand parts that swing on a walk. */
  arms: readonly string[];
  /** Emissive glow parts (dimmed on down). */
  glows: readonly string[];
  /** Every always-on part, for the respawn fade. */
  all: readonly string[];
}

/** Walk cycle; `ms` sets the cadence (the Ranger is quicker and lighter than the Warden, §2.4). */
export function knightWalk(p: KnightParts, ms: number, swing = 16, bob = 2): Clip {
  return loop(
    ms,
    { [p.root]: wave(ms, 8, (u) => ({ dy: -bob * Math.abs(sin(u)), rot: 1.5 * sin(u) })) },
    each(
      p.legBack,
      wave(ms, 8, (u) => ({ rot: swing * sin(u) })),
    ),
    each(
      p.legFront,
      wave(ms, 8, (u) => ({ rot: -swing * sin(u) })),
    ),
    each(
      p.legsBoth,
      wave(ms, 8, (u) => ({ sy: 1 - 0.05 * Math.abs(sin(u)), dx: 0.8 * sin(u) })),
    ),
    each(
      p.arms,
      wave(ms, 8, (u) => ({ rot: 6 * sin(u) })),
    ),
  );
}

export function knightIdle(p: KnightParts, ms = 1800): Clip {
  return idleBob(
    ms,
    [p.root],
    1,
    each(
      p.glows,
      wave(ms, 4, (u) => ({ glow: 1 + 0.15 * Math.max(0, sin(u)) })),
    ),
  );
}

/** Hit (§2.4): a small lean back; the white flash is code (RigInstance.flash). */
export function knightHit(p: KnightParts): Clip {
  return once(240, {
    [p.root]: [
      { t: 0, rot: 0, dx: 0 },
      { t: 70, rot: -7, dx: -2 },
      { t: 240, rot: 0, dx: 0 },
    ],
  });
}

/** Down (§2.4): kneel, emissive dims (to gray when the rig is also set unlit); holds at the end. */
export function knightDown(p: KnightParts): Clip {
  return once(
    500,
    {
      [p.root]: [
        { t: 0, dy: 0, rot: 0 },
        { t: 500, dy: 14, rot: 6 },
      ],
    },
    each(p.legBack, [
      { t: 0, rot: 0 },
      { t: 500, rot: 40 },
    ]),
    each(p.legFront, [
      { t: 0, rot: 0, sy: 1 },
      { t: 500, rot: -55, sy: 0.85 },
    ]),
    each(p.legsBoth, [
      { t: 0, sy: 1 },
      { t: 500, sy: 0.7 },
    ]),
    each(p.glows, [
      { t: 0, glow: 1 },
      { t: 500, glow: 0.2 },
    ]),
  );
}

/** Respawn (§2.4): assembles in a column of amber light: drops in, fades up, glow flares then settles. */
export function knightRespawn(p: KnightParts): Clip {
  return once(
    700,
    {
      [p.root]: [
        { t: 0, dy: -24, sy: 1.15 },
        { t: 450, dy: 0, sy: 1 },
      ],
    },
    each(p.all, [
      { t: 0, alpha: 0 },
      { t: 450, alpha: 1 },
    ]),
    each(p.glows, [
      { t: 0, alpha: 0, glow: 2 },
      { t: 450, alpha: 1, glow: 2 },
      { t: 700, alpha: 1, glow: 1 },
    ]),
  );
}

/** idle, walk, hit, down, respawn for a knight. */
export function knightClips(p: KnightParts, walkMs: number, swing?: number): Record<string, Clip> {
  return {
    idle: knightIdle(p),
    walk: knightWalk(p, walkMs, swing),
    hit: knightHit(p),
    down: knightDown(p),
    respawn: knightRespawn(p),
  };
}

/** Legged walker: legs in pairs (a/b alternate), body bob. */
export function walkerWalk(
  ms: number,
  body: readonly string[],
  legsA: readonly string[],
  legsB: readonly string[],
  swing = 14,
  bob = 1.5,
  extra: Tracks = {},
): Clip {
  return loop(
    ms,
    each(
      body,
      wave(ms, 8, (u) => ({ dy: -bob * Math.abs(sin(u)) })),
    ),
    each(
      legsA,
      wave(ms, 8, (u) => ({ rot: swing * sin(u) })),
    ),
    each(
      legsB,
      wave(ms, 8, (u) => ({ rot: -swing * sin(u) })),
    ),
    extra,
  );
}
