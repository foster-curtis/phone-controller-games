// Ranger clips (SPEC §2.4): a quicker, lighter walk than the Warden. Steady Aim is the `ready` pose
// crossfade (RigInstance.setPose). The main shot, the super and the build kneel are FF7's: wiring
// snaps to `ready` for the shot. The back views have no quiver strap (art note, BUILD_PLAN §8), so no
// clip moves one there.
import rig from '../../../../art/neon-knights/rigs/ranger.json';
import type { Clip, Keyframe, RigDef } from '../../../themes/types';
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

/**
 * Main (longbow shot, §2.4): the string snaps forward, the bow kicks up and the body rocks back a
 * little; the bow's rails and bolt flare. Played over the `ready` pose.
 */
const attack: Clip = once(
  320,
  {
    torso: [
      { t: 0, rot: 0, dx: 0 },
      { t: 40, rot: -2, dx: -2.5 },
      { t: 320, rot: 0, dx: 0 },
    ],
    // Side: the bow arm and bow kick; the draw hand flies back past the ear on release.
    frontarm: [
      { t: 0, rot: 0 },
      { t: 40, rot: -6 },
      { t: 180, rot: 1 },
      { t: 320, rot: 0 },
    ],
    backarm: [
      { t: 0, rot: 0, dx: 0 },
      { t: 50, rot: 10, dx: -3 },
      { t: 320, rot: 0, dx: 0 },
    ],
    // Front and back: the hands and bow jolt.
    hands: [
      { t: 0, dy: 0 },
      { t: 40, dy: -2 },
      { t: 320, dy: 0 },
    ],
    arms: [
      { t: 0, dx: 0 },
      { t: 50, dx: -1.5 },
      { t: 320, dx: 0 },
    ],
  },
  each(['bow-glow'], glowPulse(30, 2.6, 300)),
  each(['quivertips-glow'], glowPulse(40, 1.6, 300)),
);

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
