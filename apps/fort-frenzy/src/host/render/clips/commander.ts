// Commander clips (SPEC §2.4; RD9). The back view has only `swordtip` (art note, BUILD_PLAN §8): its
// track rides on gauntlets like the full sword in the other views. Main: the shield bash, a short
// lunge with the shield arm (wiring drops `spark-ours` at the `shield` point on the impact); the
// optional `sword` group, off by default, keeps its flare. Super: he throws a footman (Reinforcements).
// Plant: he drives or pulls the rally flag (FF9).
import rig from '../../../../art/neon-knights/rigs/commander.json';
import type { Clip, Keyframe, RigDef } from '../../../presentation/types';
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
    'shield-glow',
    'scabbard-glow',
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
    'shield',
    'scabbard',
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

/** Main: the shield arm pulls back, punches through the aim, recovers. */
export const SLASH_MS = 420;
/** The bash lands here: the sparks at the `shield` point. */
export const BASH_IMPACT_MS = 110;
/** The sword's cut, for the optional `sword` group's trail (off by default). */
export const SLASH_CUT: readonly [number, number] = [BASH_IMPACT_MS - 50, BASH_IMPACT_MS + 90];
const punch: Keyframe[] = [
  { t: 0, dx: 0, rot: 0 },
  { t: BASH_IMPACT_MS - 60, dx: -5, rot: -10 },
  { t: BASH_IMPACT_MS, dx: 13, rot: 8 },
  { t: BASH_IMPACT_MS + 90, dx: 11, rot: 6 },
  { t: SLASH_MS, dx: 0, rot: 0 },
];
const attack: Clip = once(
  SLASH_MS,
  {
    gauntlet: punch,
    gauntlets: punch,
    torso: [
      { t: 0, dx: 0, rot: 0 },
      { t: BASH_IMPACT_MS - 60, dx: -2, rot: -3 },
      { t: BASH_IMPACT_MS, dx: 5, rot: 5 },
      { t: SLASH_MS, dx: 0, rot: 0 },
    ],
  },
  each(['shield-glow'], pulse(BASH_IMPACT_MS, 3.2, SLASH_MS)),
  each(['sword-glow', 'swordtip-glow'], pulse(SLASH_CUT[1], 3.2, SLASH_MS)),
);

/** Super (Reinforcements): the arm reaches back, then hurls the footman forward. */
const THROW_MS = 520;
const hurl: Keyframe[] = [
  { t: 0, rot: 0 },
  { t: 170, rot: -70 },
  { t: 270, rot: 55 },
  { t: THROW_MS, rot: 0 },
];
const superClip: Clip = once(THROW_MS, {
  gauntlet: hurl,
  gauntlets: [
    { t: 0, dy: 0 },
    { t: 170, dy: -8 },
    { t: 270, dy: 3 },
    { t: THROW_MS, dy: 0 },
  ],
  torso: [
    { t: 0, rot: 0, dy: 0 },
    { t: 170, rot: -5, dy: 1 },
    { t: 270, rot: 6, dy: 0 },
    { t: THROW_MS, rot: 0, dy: 0 },
  ],
});

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
