// Artificer clips (SPEC §2.4). The backpack gauge is optional groups (`core<N>-full|half`), switched
// by code from the cells carried (render/gauge.ts). Main: the projector arm kicks as the nanite bolts
// leave the lens (the shot origin is the `lens` attach point); super: he braces and every seam flares
// with the wide cone; throw: the arm swings back and lobs a cell from the hand (FF9).
import rig from '../../../../art/neon-knights/rigs/artificer.json';
import type { Clip, Keyframe, RigDef } from '../../../themes/types';
import { each, knightClips, once, type KnightParts } from '../clipKit';

const parts: KnightParts = {
  root: 'torso',
  legBack: ['backleg'],
  legFront: ['frontleg'],
  arms: ['frontarm'],
  glows: ['torso-glow', 'frontleg-glow', 'helm-glow', 'frontarm-glow', 'legs-glow', 'arms-glow'],
  all: [
    'pack',
    'cell1',
    'cell2',
    'cell3',
    'slots',
    'backleg',
    'torso',
    'frontleg',
    'helm',
    'helmcap',
    'bezel',
    'frontarm',
    'legs',
    'arms',
  ],
};

const pulse = (peakAt: number, peak: number, end: number): Keyframe[] => [
  { t: 0, glow: 1 },
  { t: peakAt, glow: peak },
  { t: end, glow: 1 },
];

/** Main: the arm recoils as the bolts leave the lens, the lens flares. */
export const ATTACK_MS = 300;
const attack: Clip = once(
  ATTACK_MS,
  {
    torso: [
      { t: 0, dx: 0 },
      { t: 40, dx: -1.5 },
      { t: ATTACK_MS, dx: 0 },
    ],
    frontarm: [
      { t: 0, rot: 0 },
      { t: 40, rot: -9 },
      { t: ATTACK_MS, rot: 0 },
    ],
    arms: [
      { t: 0, dy: 0 },
      { t: 40, dy: -2 },
      { t: ATTACK_MS, dy: 0 },
    ],
  },
  each(['frontarm-glow', 'arms-glow'], pulse(40, 2.6, ATTACK_MS)),
);

/** Super: a brace, the projector raised, every seam flaring with the cone. */
const superClip: Clip = once(
  560,
  {
    torso: [
      { t: 0, dy: 0, sx: 1, sy: 1 },
      { t: 140, dy: 3, sx: 1.03, sy: 0.96 },
      { t: 240, dy: -2, sx: 0.99, sy: 1.03 },
      { t: 560, dy: 0, sx: 1, sy: 1 },
    ],
    frontarm: [
      { t: 0, rot: 0 },
      { t: 140, rot: 8 },
      { t: 240, rot: -18 },
      { t: 560, rot: 0 },
    ],
    arms: [
      { t: 0, dy: 0 },
      { t: 240, dy: -3 },
      { t: 560, dy: 0 },
    ],
  },
  each(parts.glows, pulse(240, 3, 560)),
);

/** Throw: the arm swings back, then forward and up; the cell leaves the hand at the release. */
export const THROW_RELEASE_MS = 200;
const throwClip: Clip = once(420, {
  torso: [
    { t: 0, rot: 0 },
    { t: 120, rot: -4 },
    { t: THROW_RELEASE_MS, rot: 3 },
    { t: 420, rot: 0 },
  ],
  frontarm: [
    { t: 0, rot: 0 },
    { t: 120, rot: 35 },
    { t: THROW_RELEASE_MS, rot: -55 },
    { t: 420, rot: 0 },
  ],
  arms: [
    { t: 0, dy: 0 },
    { t: 120, dy: 2 },
    { t: THROW_RELEASE_MS, dy: -5 },
    { t: 420, dy: 0 },
  ],
});

export const clips: Record<string, Clip> = {
  ...knightClips(rig as unknown as RigDef, parts, 680, 15, 2.5),
  attack,
  super: superClip,
  throw: throwClip,
};
