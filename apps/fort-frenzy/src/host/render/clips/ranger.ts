// Ranger clips (SPEC §2.4): a quicker, lighter walk than the Warden. Steady Aim is the `ready` pose
// crossfade (RigInstance.setPose). The main shot (draw, hold, release: C2), the super and the build
// kneel are FF7's: wiring snaps to `ready` for the shot. The back views have no quiver strap (art
// note, BUILD_PLAN §8), so no clip moves one there.
import rig from '../../../../art/neon-knights/rigs/ranger.json';
import type { Clip, Keyframe, Point, RigDef, ViewId } from '../../../themes/types';
import { sampleClip } from '../clip';
import { each, knightClips, once, type KnightParts } from '../clipKit';
import { half } from '../split';

const parts: KnightParts = {
  root: 'torso',
  legBack: ['backleg'],
  legFront: ['frontleg'],
  arms: ['backarm', 'frontarm'],
  glows: [
    'quiver-glow',
    'strap-glow',
    'frontleg-glow',
    'helm-glow',
    'bow-glow',
    'quivertips-glow',
    'legs-glow',
  ],
  all: [
    'quiver',
    'cloak',
    'backleg',
    'backarm',
    'torso',
    'strap',
    'frontleg',
    'helm',
    'plume',
    'bow',
    'frontarm',
    'quivertips',
    'legs',
    'arms',
    'hands',
    'paul-l',
    'paul-r',
    'pauls',
  ],
};

/** Every glow piece, split leg halves included. */
const GLOWS = [
  ...parts.glows.filter((g) => g !== 'legs-glow'),
  half('legs-glow', 'l', 'front'),
  half('legs-glow', 'r', 'front'),
  half('legs-glow', 'l', 'back'),
  half('legs-glow', 'r', 'back'),
];

const glowPulse = (peakAt: number, peak: number, end: number): Keyframe[] => [
  { t: 0, glow: 1 },
  { t: peakAt, glow: peak },
  { t: end, glow: 1 },
];

// ---- main shot (§2.4; C2 note 1: draw, hold, release) -------------------------------------------

/** The draw hand reaches the anchor (full draw: the `ready` art) at this time, ms. */
export const DRAW_END_MS = 70;
/** The string snaps and the bolt leaves here, ms; wiring holds the bolt on the bow until then. */
export const RELEASE_MS = 100;
/** The next bolt is nocked and the draw starts again (ends at full draw, the `ready` rest pose). */
const REDRAW_MS = 300;
export const ATTACK_MS = 440;

/**
 * How far the string is drawn over the attack clip: 0 straight (slack), 1 at the nock (the `ready`
 * art), below 0 past straight (the snap after the release, damped).
 */
const STRING_DRAW: readonly (readonly [t: number, draw: number])[] = [
  [0, 0],
  [35, 0.7],
  [DRAW_END_MS, 1],
  [RELEASE_MS, 1],
  [RELEASE_MS + 12, -0.3],
  [RELEASE_MS + 24, 0.16],
  [RELEASE_MS + 38, -0.07],
  [RELEASE_MS + 54, 0],
  [REDRAW_MS, 0],
  [REDRAW_MS + 60, 0.75],
  [ATTACK_MS - 20, 1],
];

/** String draw at `tMs` into the attack clip (linear between keys, held past the ends). */
export function stringDraw(tMs: number): number {
  const keys = STRING_DRAW;
  if (tMs <= keys[0]![0]) return keys[0]![1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, d1] = keys[i]!;
    if (tMs <= t1) {
      const [t0, d0] = keys[i - 1]!;
      return d0 + ((d1 - d0) * (tMs - t0)) / (t1 - t0);
    }
  }
  return keys[keys.length - 1]![1];
}

/**
 * Side draw arm: scaled out along the arm so the hand sits on the slack string by the bow (draw 0)
 * and back at the anchor at full draw (draw 1); the arm runs along x, so `sx` is its reach.
 */
const reach = (draw: number) => 1 + 0.6 * (1 - draw);

/**
 * Main (longbow shot, §2.4), played over the `ready` pose: the draw hand pulls the string back from
 * the bow to the anchor, holds while the rails charge, then lets go. The string snaps past straight
 * and shivers, the draw hand flies back past the ear, the bow kicks and the body rocks; the drawn
 * string and nocked bolt (the `ready` bow-glow) vanish with the bolt and come back as the next one
 * is nocked and drawn. While bow-glow is dark, the string is drawn by code (`bowString`).
 */
const attack: Clip = once(
  ATTACK_MS,
  {
    torso: [
      { t: 0, rot: 0, dx: 0 },
      { t: DRAW_END_MS, rot: -1, dx: 0 },
      { t: RELEASE_MS, rot: -1, dx: 0 },
      { t: RELEASE_MS + 25, rot: -2.5, dx: -2 },
      { t: 320, rot: 0, dx: 0 },
    ],
    // Side: the draw hand (back arm) reaches the string, draws, holds, then flies back on release.
    backarm: [
      { t: 0, rot: 0, sx: reach(0), dx: 0 },
      { t: 35, rot: 0, sx: reach(0.7), dx: 0 },
      { t: DRAW_END_MS, rot: 0, sx: 1, dx: 0 },
      { t: RELEASE_MS, rot: 0, sx: 1, dx: 0 },
      { t: RELEASE_MS + 30, rot: -16, sx: 0.86, dx: -3 },
      { t: 220, rot: -10, sx: 0.9, dx: -2 },
      { t: REDRAW_MS, rot: 0, sx: reach(0), dx: 0 },
      { t: REDRAW_MS + 60, rot: 0, sx: reach(0.75), dx: 0 },
      { t: ATTACK_MS - 20, rot: 0, sx: 1, dx: 0 },
    ],
    // Side: the bow arm stays locked through the draw and kicks up at the release.
    frontarm: [
      { t: 0, rot: 0 },
      { t: RELEASE_MS, rot: 0 },
      { t: RELEASE_MS + 25, rot: -5 },
      { t: 220, rot: 1 },
      { t: REDRAW_MS, rot: 0 },
    ],
    // Front and back: both arms are one part, so they ease in on the draw and jolt on the release.
    arms: [
      { t: 0, dx: 1.5, dy: 0 },
      { t: DRAW_END_MS, dx: 0, dy: 0 },
      { t: RELEASE_MS, dx: 0, dy: 0 },
      { t: RELEASE_MS + 25, dx: -1.5, dy: -1 },
      { t: REDRAW_MS, dx: 1.5, dy: 0 },
      { t: ATTACK_MS - 20, dx: 0, dy: 0 },
    ],
    hands: [
      { t: 0, dy: 0 },
      { t: RELEASE_MS, dy: 0 },
      { t: RELEASE_MS + 20, dy: -2 },
      { t: 260, dy: 0 },
    ],
  },
  // The drawn string and nocked bolt fade in as the draw ends, the rails charge through the hold,
  // and all of it drops dark at the release (the bolt is away) until the next draw.
  each(
    ['bow-glow'],
    [
      { t: 0, glow: 0 },
      { t: 45, glow: 0 },
      { t: DRAW_END_MS, glow: 1 },
      { t: RELEASE_MS - 1, glow: 2.4 },
      { t: RELEASE_MS, glow: 0 },
      { t: REDRAW_MS + 50, glow: 0 },
      { t: ATTACK_MS - 20, glow: 1 },
    ],
  ),
  // He reaches for the next bolt: the quiver tips flare.
  each(['quivertips-glow', 'quiver-glow'], glowPulse(240, 1.8, 380)),
);

/** The code-drawn string (rig units on the `ready` pose's `bow` part, per view): tips and the nock. */
const STRING_AT: Record<ViewId, { top: Point; bottom: Point; nock: Point }> = {
  side: { top: [92, 27], bottom: [92, 99], nock: [81, 63] },
  front: { top: [86.5, 27], bottom: [86.5, 99], nock: [65, 60.5] },
  back: { top: [46.5, 27], bottom: [46.5, 99], nock: [74, 42.5] },
};

export interface BowString {
  top: Point;
  nock: Point;
  bottom: Point;
  /** Shown while the art string (bow-glow) is dark: 1 − its glow. */
  alpha: number;
}

/**
 * The string at `tMs` into the attack clip, in `bow` part units, or null while the `ready` art's
 * own string shows. The ready bow-glow bakes the drawn string, the bolt and the rails into one
 * piece, so the slack and snapping string is drawn by code (BUILD_PLAN §8, FF7-fix-1).
 */
export function bowString(view: ViewId, tMs: number): BowString | null {
  const glow = sampleClip(attack, tMs).parts.get('bow-glow')?.glow ?? 1;
  const alpha = 1 - Math.min(1, Math.max(0, glow));
  if (alpha <= 0.01) return null;
  const { top, bottom, nock } = STRING_AT[view];
  // Slack: the point on the tip-to-tip line level with the nock.
  const u = (nock[1] - top[1]) / (bottom[1] - top[1]);
  const slack: Point = [top[0] + (bottom[0] - top[0]) * u, nock[1]];
  const d = stringDraw(tMs);
  return {
    top,
    bottom,
    nock: [slack[0] + (nock[0] - slack[0]) * d, slack[1] + (nock[1] - slack[1]) * d],
    alpha,
  };
}

/**
 * Super (pulse ring sized to the hit circle, §2.4; wiring draws the ring): a crouch, then he rises
 * as every seam flares with the pulse.
 */
const superClip: Clip = once(
  560,
  {
    torso: [
      { t: 0, dy: 0, sx: 1, sy: 1 },
      { t: 150, dy: 5, sx: 1.03, sy: 0.95 },
      { t: 250, dy: -4, sx: 0.98, sy: 1.04 },
      { t: 560, dy: 0, sx: 1, sy: 1 },
    ],
    frontarm: [
      { t: 0, rot: 0 },
      { t: 150, rot: 8 },
      { t: 250, rot: -14 },
      { t: 560, rot: 0 },
    ],
    backarm: [
      { t: 0, rot: 0 },
      { t: 150, rot: -8 },
      { t: 250, rot: 14 },
      { t: 560, rot: 0 },
    ],
    arms: [
      { t: 0, dy: 0 },
      { t: 150, dy: 2 },
      { t: 250, dy: -3 },
      { t: 560, dy: 0 },
    ],
  },
  each(GLOWS, glowPulse(250, 3, 560)),
);

/**
 * Build (kneel and place a deploy beacon, §2.4): he drops to one knee, reaches down to set the
 * beacon at his feet, and stands. Wiring drops the beacon at the reach and unfolds the turret.
 */
export const BUILD_PLACE_MS = 360;
const kneel = (v: number): Keyframe[] => [
  { t: 0, rot: 0, sy: 1 },
  { t: 200, rot: v, sy: 0.9 },
  { t: 520, rot: v, sy: 0.9 },
  { t: 720, rot: 0, sy: 1 },
];
const halfKneel = (sy: number, dy: number): Keyframe[] => [
  { t: 0, sy: 1, dy: 0 },
  { t: 200, sy, dy },
  { t: 520, sy, dy },
  { t: 720, sy: 1, dy: 0 },
];
const build: Clip = once(
  720,
  {
    torso: [
      { t: 0, dy: 0, rot: 0 },
      { t: 200, dy: 11, rot: 5 },
      { t: 520, dy: 11, rot: 5 },
      { t: 720, dy: 0, rot: 0 },
    ],
    frontleg: kneel(-35),
    backleg: kneel(30),
    [half('legs', 'l', 'front')]: halfKneel(0.72, 2),
    [half('legs', 'r', 'front')]: halfKneel(0.86, 0),
    [half('legs', 'l', 'back')]: halfKneel(0.86, 0),
    [half('legs', 'r', 'back')]: halfKneel(0.72, 2),
    // The free hand reaches to the ground and back.
    backarm: [
      { t: 0, rot: 0 },
      { t: 220, rot: -30 },
      { t: BUILD_PLACE_MS, rot: -42 },
      { t: 560, rot: -10 },
      { t: 720, rot: 0 },
    ],
    arms: [
      { t: 0, dy: 0 },
      { t: BUILD_PLACE_MS, dy: 6 },
      { t: 720, dy: 0 },
    ],
  },
  each(GLOWS, glowPulse(BUILD_PLACE_MS, 1.8, 720)),
);

export const clips: Record<string, Clip> = {
  ...knightClips(rig as unknown as RigDef, parts, 560, 18, 2),
  attack,
  super: superClip,
  build,
};
