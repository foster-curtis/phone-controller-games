// Artificer clips (SPEC §2.4). The backpack gauge is optional groups (`core<N>-full|half`), switched
// by code from his build meter (render/gauge.ts). Main: the projector arm kicks with each nanite that
// leaves the lens (the shot origin is the `lens` attach point); super: he braces and every seam flares
// with the wide cone; throw: the arm swings back and lobs the beacon (RD8).
import rig from '../../../../art/neon-knights/rigs/artificer.json';
import type { Clip, Keyframe, RigDef } from '../../../presentation/types';
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

/** Main (nanite blast, RD8): the gap between nanites; content's `burstMs` = 4 gaps (speeds test). */
export const BLAST_SHOT_MS = 200;
const BLAST_SHOTS = [0, 1, 2, 3, 4].map((i) => i * BLAST_SHOT_MS);
const KICK_MS = 40;
export const ATTACK_MS = BLAST_SHOTS[4]! + 160;

/** One key track that kicks to `peak` at every nanite and eases back to `rest` before the next. */
const kicks = (rest: Partial<Keyframe>, peak: Partial<Keyframe>): Keyframe[] => [
  ...BLAST_SHOTS.flatMap((t) => [
    { t, ...rest },
    { t: t + KICK_MS, ...peak },
  ]),
  { t: ATTACK_MS, ...rest },
];

/** Main: the arm recoils and the lens flares with each of the five nanites. */
const attack: Clip = once(
  ATTACK_MS,
  {
    torso: kicks({ dx: 0 }, { dx: -1.5 }),
    frontarm: kicks({ rot: 0 }, { rot: -9 }),
    arms: kicks({ dy: 0 }, { dy: -2 }),
  },
  each(['frontarm-glow', 'arms-glow'], kicks({ glow: 1 }, { glow: 2.6 })),
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
