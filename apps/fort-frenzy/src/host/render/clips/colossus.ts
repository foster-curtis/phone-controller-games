// Colossus clips (SPEC §9.6). Walk: slow heavy steps; the legs trade places every step: the stepping
// leg swings forward and is drawn in front, the planted one drops behind. The draw order swaps at
// mid-stride (where the legs cross) with a slight scale-up on the leg in front. Tier add-ons are
// children of their base parts, so they follow. Attacks and stagger arrive with FF11.
import type { Clip, Keyframe } from '../../../themes/types';
import { each, idleBob, loop, wave } from '../clipKit';

// The rig's side-view order (rigs/colossus.json); the near leg is in front at rest.
const NEAR_FRONT = [
  'spires-mk3',
  'spires-mk2',
  'plumes',
  'arm-far',
  'fist-far',
  'fist-far-mk2',
  'fist-far-mk3',
  'leg-far',
  'leg-far-mk2',
  'hip',
  'torso',
  'leg-near',
  'leg-near-mk2',
  'leg-near-mk3',
  'yoke',
  'yoke-mk2',
  'yoke-mk3',
  'head-mk3',
  'head',
  'core',
  'core-mk3',
  'core-final',
  'arm-near',
  'arm-near-mk3',
  'pauldron-near',
  'pauldron-near-mk2',
  'pauldron-near-mk3',
  'fist-near',
  'fist-near-mk2',
];
const NEAR = ['leg-near', 'leg-near-mk2', 'leg-near-mk3'];
const FAR = ['leg-far', 'leg-far-mk2'];
/** Far leg in front: the two leg groups trade slots. */
const FAR_FRONT = [
  ...NEAR_FRONT.slice(0, NEAR_FRONT.indexOf('leg-far')),
  ...NEAR,
  'hip',
  'torso',
  ...FAR,
  ...NEAR_FRONT.slice(NEAR_FRONT.indexOf('leg-near-mk3') + 1),
];

const MS = 1800;
const TAU = Math.PI * 2;
// Near leg rot: +14 (back) at u = 0 → −14 (forward) at u = 0.5; the legs cross at u = 0.25, 0.75.
const nearRot = (u: number) => 14 * Math.cos(u * TAU);
/** In front between the crossings: near for u ∈ [0.25, 0.75), far otherwise. */
const nearInFront = (u: number) => u >= 0.25 && u < 0.75;

const legTrack = (near: boolean): Keyframe[] =>
  wave(MS, 16, (u) => {
    const front = near === nearInFront(u % 1);
    const s = front ? 1.04 : 1;
    return { rot: near ? nearRot(u) : -nearRot(u), sx: s, sy: s };
  });

const torso: Keyframe[] = [...wave(MS, 8, (u) => ({ dy: 3 * Math.abs(Math.sin(u * TAU)) }))].map(
  (k) => k,
);
torso.push(
  { t: 0, order: FAR_FRONT },
  { t: MS * 0.25, order: NEAR_FRONT },
  { t: MS * 0.75, order: FAR_FRONT },
);
torso.sort((a, b) => a.t - b.t);

export const clips: Record<string, Clip> = {
  idle: idleBob(2600, ['torso'], 1.5),
  walk: loop(
    MS,
    { torso },
    each(NEAR.slice(0, 1), legTrack(true)),
    each(FAR.slice(0, 1), legTrack(false)),
    each(
      ['arm-near', 'arm-far'],
      wave(MS, 8, (u) => ({ rot: 3 * Math.sin(u * TAU) })),
    ),
  ),
};

export const COLOSSUS_ORDERS = { NEAR_FRONT, FAR_FRONT };
