// Colossus clips (SPEC §9.6). Walk: slow, heavy stomping steps (C1 note 3); the legs trade places
// every step: the stepping leg lifts, swings forward and is drawn in front, the planted one drops
// behind. The draw order swaps at mid-stride (where the legs cross) with a slight scale-up on the
// leg in front; the body drops hard on each footfall while the planted foot stays on the ground.
// Tier add-ons are children of their base parts, so they follow.
// FF11 (§9.6 tells): `slam` (both fists raise over the 1.5 s wind-up, then come down on the impact
// frame; the wall breaker plays it too), `throw` (the near fist tears up scrap, winds back and throws
// at the wind-up's end), `call` (it rears up and the spires surge, the Runners launch at the end) and
// `stagger` (drops to one knee for the 3 s stagger, then rises). The legs are single parts (no knee,
// BUILD_PLAN §8 FF3-fix-1), so the kneel is a body drop with the near leg swung forward and both
// legs shortened. Code adds the head tracking, fist and spire flares and the core glow
// (scene/colossusView.ts).
import rig from '../../../../art/neon-knights/rigs/colossus.json';
import type { Clip, Keyframe, RigDef } from '../../../themes/types';
import {
  each,
  enemyDeath,
  enemyHit,
  idleBob,
  loop,
  once,
  stompBody,
  stompDy,
  wave,
  withOrders,
} from '../clipKit';

/** The slam lands on this frame: the sim's 1.5 s wind-up (content `colossus.attack.windupMs`). */
export const COLOSSUS_SLAM_MS = 1500;
/** The boulder leaves the near fist here: the sim's boulder wind-up (`boulderWindupMs`). */
export const COLOSSUS_THROW_MS = 1000;
/** The Runners launch here: the sim's call wind-up (`callWindupMs`). */
export const COLOSSUS_CALL_MS = 1000;
/** The kneel lasts the sim's stagger (`staggerMs`). */
export const COLOSSUS_STAGGER_MS = 3000;
/** Head turn toward its aim, degrees at full sideways, and how far it slides (sprite units). */
export const HEAD_TURN = { rot: 9, dx: 4, dy: 3 };

const S = COLOSSUS_SLAM_MS;
const slam: Clip = once(
  S + 800,
  {
    torso: [
      { t: 0, rot: 0, dy: 0 },
      { t: 420, rot: -6, dy: -5 },
      { t: S - 120, rot: -7, dy: -6 },
      { t: S, rot: 9, dy: 9 },
      { t: S + 220, rot: 7, dy: 7 },
      { t: S + 800, rot: 0, dy: 0 },
    ],
  },
  // Both fists come up overhead and tremble at the top, then hammer the ground in front.
  each(
    ['arm-near', 'arm-far'],
    [
      { t: 0, rot: 0 },
      { t: 420, rot: -150 },
      { t: 900, rot: -156 },
      { t: S - 120, rot: -152 },
      { t: S, rot: -32 },
      { t: S + 260, rot: -36 },
      { t: S + 800, rot: 0 },
    ],
  ),
  {
    // The legs brace wider for the blow.
    'leg-near': [
      { t: 0, rot: 0, dy: 0 },
      { t: S, rot: -8, dy: -9 },
      { t: S + 800, rot: 0, dy: 0 },
    ],
    'leg-far': [
      { t: 0, rot: 0, dy: 0 },
      { t: S, rot: 7, dy: -9 },
      { t: S + 800, rot: 0, dy: 0 },
    ],
    yoke: [
      { t: 0, dy: 0 },
      { t: S, dy: 3 },
      { t: S + 300, dy: 0 },
    ],
  },
);

const R = COLOSSUS_THROW_MS;
const throwClip: Clip = once(R + 600, {
  torso: [
    { t: 0, rot: 0, dy: 0 },
    { t: 300, rot: 12, dy: 8 },
    { t: 420, rot: 11, dy: 7 },
    { t: R - 120, rot: -8, dy: -2 },
    { t: R, rot: 9, dy: 3 },
    { t: R + 600, rot: 0, dy: 0 },
  ],
  // Down to the ground for the scrap, back over its shoulder, then the throw.
  'arm-near': [
    { t: 0, rot: 0 },
    { t: 300, rot: -40 },
    { t: 420, rot: -38 },
    { t: R - 120, rot: 125 },
    { t: R, rot: -115 },
    { t: R + 200, rot: -95 },
    { t: R + 600, rot: 0 },
  ],
  'arm-far': [
    { t: 0, rot: 0 },
    { t: 300, rot: 10 },
    { t: R - 120, rot: -20 },
    { t: R, rot: 14 },
    { t: R + 600, rot: 0 },
  ],
  'leg-near': [
    { t: 0, rot: 0, dy: 0 },
    { t: 300, rot: -6, dy: -8 },
    { t: R, rot: -10, dy: -3 },
    { t: R + 600, rot: 0, dy: 0 },
  ],
});

const C = COLOSSUS_CALL_MS;
const call: Clip = once(C + 500, {
  // It rears back and spreads its arms while the spires surge; a jolt as the Runners launch.
  torso: [
    { t: 0, rot: 0, dy: 0 },
    { t: C - 200, rot: -7, dy: -5 },
    { t: C, rot: 3, dy: 4 },
    { t: C + 500, rot: 0, dy: 0 },
  ],
  'arm-near': [
    { t: 0, rot: 0 },
    { t: C - 200, rot: -24 },
    { t: C, rot: -10 },
    { t: C + 500, rot: 0 },
  ],
  'arm-far': [
    { t: 0, rot: 0 },
    { t: C - 200, rot: 22 },
    { t: C, rot: 8 },
    { t: C + 500, rot: 0 },
  ],
  yoke: [
    { t: 0, dy: 0, rot: 0 },
    { t: C - 200, dy: -3, rot: -3 },
    { t: C, dy: 4, rot: 2 },
    { t: C + 500, dy: 0, rot: 0 },
  ],
});

const K = COLOSSUS_STAGGER_MS;
/** Body drop when kneeling, sprite units. */
const KNEEL = 34;
const stagger: Clip = once(
  K,
  {
    torso: [
      { t: 0, rot: 0, dy: 0 },
      { t: 260, rot: 9, dy: KNEEL + 4 },
      { t: 420, rot: 7, dy: KNEEL },
      { t: K - 520, rot: 6, dy: KNEEL - 2 },
      { t: K, rot: 0, dy: 0 },
    ],
    // The near leg comes forward as the knee, the far one folds back under it; both shorten so the
    // feet stay on the ground under the dropped body.
    'leg-near': [
      { t: 0, rot: 0, dy: 0, sy: 1 },
      { t: 260, rot: -58, dy: -KNEEL + 6, sy: 0.72 },
      { t: K - 520, rot: -54, dy: -KNEEL + 6, sy: 0.74 },
      { t: K, rot: 0, dy: 0, sy: 1 },
    ],
    'leg-far': [
      { t: 0, rot: 0, dy: 0, sy: 1 },
      { t: 260, rot: 30, dy: -KNEEL + 4, sy: 0.7 },
      { t: K - 520, rot: 28, dy: -KNEEL + 4, sy: 0.72 },
      { t: K, rot: 0, dy: 0, sy: 1 },
    ],
  },
  // Fists slump to the ground, head hangs.
  each(
    ['arm-near', 'arm-far'],
    [
      { t: 0, rot: 0 },
      { t: 300, rot: -14 },
      { t: K - 520, rot: -12 },
      { t: K, rot: 0 },
    ],
  ),
  {
    head: [
      { t: 0, rot: 0, dy: 0 },
      { t: 360, rot: 12, dy: 6 },
      { t: K - 520, rot: 10, dy: 5 },
      { t: K, rot: 0, dy: 0 },
    ],
  },
);

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
  slam,
  throw: throwClip,
  call,
  stagger,
};

export const COLOSSUS_ORDERS = { NEAR_FRONT, FAR_FRONT };
