// Colossus clips (SPEC §9.6). Walk: slow, heavy stomping steps (C1 note 3); the legs trade places
// every step: the stepping leg lifts, swings forward and is drawn in front, the planted one drops
// behind. The draw order swaps at mid-stride (where the legs cross) with a slight scale-up on the
// leg in front; the body drops hard on each footfall while the planted foot stays on the ground.
// Tier add-ons are children of their base parts, so they follow. Attacks and stagger arrive with
// FF11.
import rig from '../../../../art/neon-knights/rigs/colossus.json';
import type { Clip, Keyframe, RigDef } from '../../../themes/types';
import {
  each,
  enemyDeath,
  enemyHit,
  idleBob,
  loop,
  stompBody,
  stompDy,
  wave,
  withOrders,
} from '../clipKit';

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

const MS = 1900;
const TAU = Math.PI * 2;
/** Body drop on each footfall, sprite units. */
const DIP = 7;
// Near leg rot: +14 (back) at u = 0 → −14 (forward) at u = 0.5; the legs cross at u = 0.25, 0.75.
// Footfalls: the far leg lands at u = 0, the near leg at u = 0.5.
const nearRot = (u: number) => 14 * Math.cos(u * TAU);
/** In front between the crossings: near for u ∈ [0.25, 0.75), far otherwise. */
const nearInFront = (u: number) => u >= 0.25 && u < 0.75;
/** The near leg swings (lifted) for u in (0, 0.5), the far one for (0.5, 1). */
const lift = (near: boolean, u: number) => Math.max(0, (near ? 1 : -1) * Math.sin(u * TAU));

const legTrack = (near: boolean): Keyframe[] =>
  wave(MS, 32, (u) => {
    const front = near === nearInFront(u % 1);
    const s = front ? 1.04 : 1;
    const l = lift(near, u);
    return {
      rot: (near ? nearRot(u) : -nearRot(u)) - 4 * l,
      // The legs hang from the torso: cancel its drop so the planted foot stays put, then lift.
      dy: -stompDy(u, 2, DIP) - 9 * l,
      sx: s,
      sy: s - 0.07 * l,
    };
  });

const torso = withOrders(stompBody(MS, 2, DIP), [
  { t: 0, order: FAR_FRONT },
  { t: MS * 0.25, order: NEAR_FRONT },
  { t: MS * 0.75, order: FAR_FRONT },
]);

export const clips: Record<string, Clip> = {
  idle: idleBob(2600, ['torso'], 1.5),
  walk: loop(
    MS,
    { torso },
    each(NEAR.slice(0, 1), legTrack(true)),
    each(FAR.slice(0, 1), legTrack(false)),
    each(
      ['arm-near', 'arm-far'],
      wave(MS, 16, (u) => ({ rot: 4 * Math.sin(u * TAU) })),
    ),
    // The yoke and head lag the footfall a little (the weight settling).
    { yoke: wave(MS, 16, (u) => ({ dy: 0.4 * stompDy(u - 0.06, 2, DIP) })) },
    { head: wave(MS, 16, (u) => ({ rot: 2 * Math.sin(u * 2 * TAU) })) },
  ),
  hit: enemyHit(['torso'], 2.5, 2, 380),
  death: enemyDeath(rig as unknown as RigDef, {
    start: 300,
    fall: 700,
    stagger: 360,
    hold: 1200,
    fadeMs: 900,
    squeeze: 0.5,
  }),
};

export const COLOSSUS_ORDERS = { NEAR_FRONT, FAR_FRONT };
