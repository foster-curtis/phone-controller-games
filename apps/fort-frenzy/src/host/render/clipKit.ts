// Helpers for authoring clips in render/clips/<rig>.ts (SPEC §15.2): keyframe tracks sampled from
// periodic functions, the knights' shared hit / down / respawn (§2.4) and every enemy's hit and
// death (C1 notes, BUILD_PLAN §8 FF3-fix-1). Tracks may name parts from every view; a view ignores
// the parts it doesn't have. Side views face right: a positive `rot` swings a hanging leg's foot
// back (clockwise on screen), a negative one forward.
import type { Clip, Keyframe, RigDef, ViewId } from '../../themes/types';
import { collapseTracks, landedAt, type CollapseOpts } from './fall';
import { half, splitPartNames } from './split';

export type KeyValues = Omit<Keyframe, 't' | 'order'>;
export type Tracks = Record<string, Keyframe[]>;

const TAU = Math.PI * 2;
export const sin = (u: number, phase = 0) => Math.sin((u + phase) * TAU);
export const cos = (u: number, phase = 0) => Math.cos((u + phase) * TAU);

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

/** Adds order keys to a track (kept sorted by time). */
export function withOrders(track: Keyframe[], orders: Keyframe[]): Keyframe[] {
  return [...track, ...orders].sort((a, b) => a.t - b.t);
}

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

// ---- knights (§2.4) --------------------------------------------------------------------------------

export interface KnightParts {
  /** The root part (torso), whose children follow. */
  root: string;
  /** Side-view legs: the far (back) leg and the near (front) leg. */
  legBack: readonly string[];
  legFront: readonly string[];
  /** Arm or weapon-hand parts that swing on a walk. */
  arms: readonly string[];
  /** Emissive glow parts (dimmed on down). `legs-glow` stands for its split halves. */
  glows: readonly string[];
  /** Every always-on part, for the respawn fade. `legs` stands for its split halves. */
  all: readonly string[];
}

/** Names with each split part (`legs`, `legs-glow`) replaced by its halves (render/split.ts). */
function expandSplits(rigId: string, names: readonly string[]): string[] {
  const halves = splitPartNames(rigId);
  return names.flatMap((n) => {
    const h = halves.filter((x) => x.slice(0, x.lastIndexOf('.')) === n);
    return h.length > 0 ? h : [n];
  });
}

/**
 * Walk cycle (C1 note 3); `ms` sets the cadence (the Ranger is quicker and lighter than the Warden).
 * Side: each leg swings from the hip and, while it swings forward, shortens (knee bend) and leads
 * with the foot; the body drops at each footfall and rises as the legs pass. Front and back: the two
 * leg halves move on their own: the near leg drops lower on screen and grows a little, the far one
 * rises and shrinks, the stepping leg lifts, and the near leg is drawn in front (swapped each step).
 */
export function knightWalk(p: KnightParts, ms: number, swing = 16, bob = 2.5): Clip {
  const lift = (u: number, forward: 1 | -1) => Math.max(0, forward * cos(u));
  // Front: the leg moving toward the camera (getting nearer) is the one stepping; back: away.
  const halfLeg = (n: (u: number) => number, step: (u: number) => number) =>
    wave(ms, 16, (u) => {
      const near = n(u);
      const l = step(u);
      return { dy: 3 * near - 1.5 * l, sx: 1 + 0.06 * near, sy: 1 + 0.06 * near - 0.2 * l };
    });
  const nearL = (u: number) => sin(u);
  const nearR = (u: number) => -sin(u);
  const L = (v: 'front' | 'back') => [half('legs', 'l', v), half('legs-glow', 'l', v)];
  const R = (v: 'front' | 'back') => [half('legs', 'r', v), half('legs-glow', 'r', v)];
  // The near leg is drawn in front: left near for u in (0, 0.5), right near for (0.5, 1).
  const orders: Keyframe[] = [
    { t: 0, order: [...R('front'), ...L('front'), ...R('back'), ...L('back')] },
    { t: Math.round(ms / 2), order: [...L('front'), ...R('front'), ...L('back'), ...R('back')] },
  ];
  return loop(
    ms,
    {
      [p.root]: withOrders(
        wave(ms, 16, (u) => ({ dy: bob * (Math.abs(sin(u)) - 0.3), rot: 1.5 * sin(u) })),
        orders,
      ),
    },
    each(
      p.legBack,
      wave(ms, 16, (u) => {
        const l = lift(u, -1);
        return { rot: swing * sin(u) - 5 * l, sy: 1 - 0.16 * l };
      }),
    ),
    each(
      p.legFront,
      wave(ms, 16, (u) => {
        const l = lift(u, 1);
        return { rot: -swing * sin(u) - 5 * l, sy: 1 - 0.16 * l };
      }),
    ),
    { [half('legs', 'l', 'front')]: halfLeg(nearL, (u) => lift(u, 1)) },
    { [half('legs', 'r', 'front')]: halfLeg(nearR, (u) => lift(u, -1)) },
    { [half('legs', 'l', 'back')]: halfLeg(nearL, (u) => lift(u, -1)) },
    { [half('legs', 'r', 'back')]: halfLeg(nearR, (u) => lift(u, 1)) },
    each(
      p.arms,
      wave(ms, 8, (u) => ({ rot: 6 * sin(u) })),
    ),
  );
}

export function knightIdle(p: KnightParts, glows: readonly string[], ms = 1800): Clip {
  return idleBob(
    ms,
    [p.root],
    1,
    each(
      glows,
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

/** Down timing: the glow dims first, then the armor falls; code turns the rig unlit at `dimMs`. */
export const KNIGHT_DOWN: CollapseOpts & { dimMs: number } = {
  dimMs: 260,
  start: 260,
  fall: 420,
  stagger: 160,
  seed: 'knight',
};

/**
 * Down (C1 note 4, replaces the kneel): the knight dims, then every piece of armor falls to the
 * ground into a pile (with scrap, spawned by code: fall.ts `spawnPile`), and stays there for the
 * down timer (the clip holds its last frame).
 */
export function knightDown(
  def: RigDef,
  p: KnightParts,
  glows: readonly string[],
  view: ViewId,
): Clip {
  const o = { ...KNIGHT_DOWN, seed: def.id };
  const tracks = collapseTracks(def, o, view);
  // The dim: glow fades out, and the body slumps a little before it comes apart.
  for (const g of glows)
    tracks[g] = [...(tracks[g] ?? []), { t: 0, glow: 1 }, { t: o.dimMs, glow: 0.12 }];
  // The root's second key holds it until its fall starts: slumped by then.
  const root = tracks[p.root];
  if (root && root[1]) root[1] = { ...root[1], dy: 2 };
  for (const keys of Object.values(tracks)) keys.sort((a, b) => a.t - b.t);
  return once(landedAt(o) + o.stagger + 200, tracks);
}

/**
 * A part's joints sit differently in each view (the Warden's hammer rides his gauntlet in side
 * view, hangs off-center in back view), so the pile is solved per view: `down@side`, `down@front`,
 * `down@back`, which RigSprite picks for its current view (`down` is the side solution).
 */
export function perViewClips(
  def: RigDef,
  name: string,
  make: (view: ViewId) => Clip,
): Record<string, Clip> {
  const out: Record<string, Clip> = {};
  for (const view of ['side', 'front', 'back'] as const)
    if (def.views[view]) out[`${name}@${view}`] = make(view);
  out[name] = out[`${name}@side`] ?? Object.values(out)[0]!;
  return out;
}

/** Respawn (§2.4): assembles in a column of amber light: drops in, fades up, glow flares then settles. */
export function knightRespawn(
  all: readonly string[],
  p: KnightParts,
  glows: readonly string[],
): Clip {
  return once(
    1100,
    {
      [p.root]: [
        { t: 0, dy: -24, sy: 1.15 },
        { t: 700, dy: 0, sy: 1 },
      ],
    },
    each(all, [
      { t: 0, alpha: 0 },
      { t: 700, alpha: 1 },
    ]),
    each(glows, [
      { t: 0, alpha: 0, glow: 2 },
      { t: 700, alpha: 1, glow: 2 },
      { t: 1100, alpha: 1, glow: 1 },
    ]),
  );
}

/** idle, walk, hit, down, respawn for a knight. */
export function knightClips(
  def: RigDef,
  p: KnightParts,
  walkMs: number,
  swing?: number,
  bob?: number,
): Record<string, Clip> {
  const glows = expandSplits(def.id, p.glows);
  const all = expandSplits(def.id, p.all);
  return {
    idle: knightIdle(p, glows),
    walk: knightWalk(p, walkMs, swing, bob),
    hit: knightHit(p),
    ...perViewClips(def, 'down', (view) => knightDown(def, p, glows, view)),
    respawn: knightRespawn(all, p, glows),
  };
}

// ---- enemies (§9.6) --------------------------------------------------------------------------------

/**
 * Legged walker: legs in pairs (a/b alternate). A leg shortens and leads with its foot while it
 * swings forward (a knee-bend read); the body drops a little at each footfall.
 */
export function walkerWalk(
  ms: number,
  body: readonly string[],
  legsA: readonly string[],
  legsB: readonly string[],
  swing = 14,
  bob = 1.5,
  extra: Tracks = {},
  liftAmt = 0.12,
): Clip {
  const leg = (sign: 1 | -1) =>
    wave(ms, 16, (u) => {
      const l = Math.max(0, -sign * cos(u));
      return { rot: sign * swing * sin(u) - 4 * l, sy: 1 - liftAmt * l };
    });
  return loop(
    ms,
    each(
      body,
      wave(ms, 16, (u) => ({ dy: bob * (Math.abs(sin(u)) - 0.4) })),
    ),
    each(legsA, leg(1)),
    each(legsB, leg(-1)),
    extra,
  );
}

/**
 * One stomping leg (Brute, C1 note 3): planted, it slides back under the body; then it lifts high,
 * swings forward and slams down fast. Translation, not rotation, so the foot stays flat. `phase`
 * offsets the cycle (0.5 for the other leg).
 */
export function stompLeg(
  ms: number,
  phase: number,
  o: { stride: number; lift: number; steps?: number },
): Keyframe[] {
  return wave(ms, o.steps ?? 32, (u0) => {
    const u = (u0 + phase + 1) % 1;
    if (u < 0.55) {
      // Stance: slides from front to back.
      const k = u / 0.55;
      return { dx: o.stride * (1 - 2 * k), dy: 0, sy: 1 };
    }
    // Swing: up fast, forward, then a fast drop (the stomp) at the end.
    const k = (u - 0.55) / 0.45;
    const up = k < 0.8 ? Math.sin((k / 0.8) * (Math.PI / 2)) : 1 - (k - 0.8) / 0.2;
    return { dx: o.stride * (-1 + 2 * k), dy: -o.lift * up, sy: 1 - 0.06 * up };
  });
}

/** 0..1 impact curve at each footfall (`hits` per cycle): a sharp rise on impact, a slow decay. */
export function stompImpact(u: number, hits: number): number {
  const v = (((u * hits) % 1) + 1) % 1;
  return v < 0.08 ? v / 0.08 : Math.max(0, 1 - (v - 0.08) / 0.4);
}

/** Body dip at each footfall: drops `dip` units on impact and rises slowly. */
export const stompDy = (u: number, hits: number, dip: number) =>
  dip * stompImpact(u, hits) - dip * 0.25;

export function stompBody(ms: number, hits: number, dip: number, steps = 32): Keyframe[] {
  return wave(ms, steps, (u) => ({
    dy: stompDy(u, hits, dip),
    sy: 1 - 0.025 * stompImpact(u, hits),
  }));
}

/** Enemy hit (C1 note 2): a recoil lean away from the blow; code flashes the body white. */
export function enemyHit(roots: readonly string[], lean = 6, kick = 3, ms = 260): Clip {
  return once(
    ms,
    each(roots, [
      { t: 0, rot: 0, dx: 0, sx: 1, sy: 1 },
      { t: 60, rot: -lean, dx: -kick, sx: 1.03, sy: 0.96 },
      { t: Math.round(ms * 0.6), rot: lean * 0.25, dx: kick * 0.2, sx: 1, sy: 1 },
      { t: ms, rot: 0, dx: 0, sx: 1, sy: 1 },
    ]),
  );
}

export interface DeathOpts extends CollapseOpts {
  /** Fade after lying still, ms. */
  hold: number;
  fadeMs: number;
}

export const ENEMY_DEATH: Omit<DeathOpts, 'seed'> = {
  start: 120,
  fall: 380,
  stagger: 140,
  hold: 700,
  fadeMs: 600,
};

/**
 * Enemy death (C1 note 4): the glow cuts out (code: setUnlit), every part collapses into a pile on
 * the ground, code spawns `scrap-theirs` under it when it lands (`landedAt`), then the parts fade.
 */
export function enemyDeath(def: RigDef, o: Partial<DeathOpts> = {}): Clip {
  const d: DeathOpts = { ...ENEMY_DEATH, seed: def.id, ...o };
  const fadeAt = Math.round(landedAt(d) + d.stagger * 0.5 + d.hold);
  const end = fadeAt + d.fadeMs;
  return once(end, collapseTracks(def, { ...d, fade: [fadeAt, end] }));
}
