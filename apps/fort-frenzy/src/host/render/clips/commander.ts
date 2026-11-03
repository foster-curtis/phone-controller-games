// Commander clips (SPEC §2.4). The back view has only `swordtip` (art note, BUILD_PLAN §8): its
// track rides on gauntlets like the full sword in the other views. Main: a slash, the amber edge
// flaring (wiring draws the trail along the exact hit arc); super: the sword raised for morale; plant:
// he drives the rally flag into the ground (FF9).
import rig from '../../../../art/neon-knights/rigs/commander.json';
import type { Clip, Keyframe, RigDef } from '../../../themes/types';
import { each, knightClips, once, wave, sin, type KnightParts } from '../clipKit';

const parts: KnightParts = {
  root: 'torso',
  legBack: ['backleg'],
  legFront: ['frontleg'],
  arms: ['gauntlet'],
  glows: [
    'torso-glow',
    'frontleg-glow',
    'helm-glow',
    'sword-glow',
    'legs-glow',
    'swordtip-glow',
    'banner-glow',
  ],
  all: [
    'cape',
    'backleg',
    'torso',
    'frontleg',
    'helm',
    'plume',
    'plume-base',
    'frontpaul',
    'sword',
    'gauntlet',
    'legs',
    'pauls',
    'gauntlets',
    'swordtip',
    'banner',
    'banner-cloth',
  ],
};

const base = knightClips(rig as unknown as RigDef, parts, 680, 15, 2.5);
// The carried banner sways with the walk (it only shows while the `banner` group is on).
const sway = each(
  ['banner'],
  wave(680, 8, (u) => ({ rot: 3 * sin(u, 0.25) })),
);

const pulse = (peakAt: number, peak: number, end: number): Keyframe[] => [
  { t: 0, glow: 1 },
  { t: peakAt, glow: peak },
  { t: end, glow: 1 },
];

/** Main: wind back, a fast slash across, recover; the edge flares through the cut. */
export const SLASH_MS = 420;
/** The blade crosses the hit arc between these times (wiring times the trail to them). */
export const SLASH_CUT: readonly [number, number] = [80, 200];
const swing: Keyframe[] = [
  { t: 0, rot: 0 },
  { t: SLASH_CUT[0], rot: -45 },
  { t: SLASH_CUT[1], rot: 70 },
  { t: SLASH_MS, rot: 0 },
];
const attack: Clip = once(
  SLASH_MS,
  {
    gauntlet: swing,
    gauntlets: swing,
    torso: [
      { t: 0, rot: 0 },
      { t: SLASH_CUT[0], rot: -4 },
      { t: SLASH_CUT[1], rot: 5 },
      { t: SLASH_MS, rot: 0 },
    ],
  },
  each(['sword-glow', 'swordtip-glow'], pulse(SLASH_CUT[1], 3.2, SLASH_MS)),
);

/** Super (morale): the sword raised high, every seam flaring with the amber pulse. */
const raise: Keyframe[] = [
  { t: 0, rot: 0 },
  { t: 200, rot: -80 },
  { t: 440, rot: -80 },
  { t: 640, rot: 0 },
];
const superClip: Clip = once(
  640,
  {
    gauntlet: raise,
    gauntlets: [
      { t: 0, dy: 0 },
      { t: 200, dy: -8 },
      { t: 440, dy: -8 },
      { t: 640, dy: 0 },
    ],
    torso: [
      { t: 0, dy: 0, sy: 1 },
      { t: 200, dy: -2, sy: 1.03 },
      { t: 640, dy: 0, sy: 1 },
    ],
  },
  each(parts.glows, pulse(220, 3, 640)),
);

/** Plant: a short crouch as he drives the flag down; recall reuses it. */
export const PLANT_MS = 460;
const plant: Clip = once(PLANT_MS, {
  torso: [
    { t: 0, dy: 0, rot: 0 },
    { t: 180, dy: 6, rot: 4 },
    { t: PLANT_MS, dy: 0, rot: 0 },
  ],
  gauntlet: [
    { t: 0, rot: 0 },
    { t: 180, rot: 25 },
    { t: PLANT_MS, rot: 0 },
  ],
  gauntlets: [
    { t: 0, dy: 0 },
    { t: 180, dy: 5 },
    { t: PLANT_MS, dy: 0 },
  ],
});

export const clips: Record<string, Clip> = {
  ...base,
  walk: { ...base.walk!, tracks: { ...base.walk!.tracks, ...sway } },
  attack,
  super: superClip,
  plant,
};
