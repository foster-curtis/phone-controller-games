// Bombard (Siege) clips (SPEC §9.6): plods on four splayed legs (C1 note 3). A four-beat walk: each
// leg steps on its own quarter of the cycle, and the two middle legs (far-front, near-rear) step
// half a cycle apart and stand a little apart, so they read as two legs. The legs translate rather
// than turn, so the foot pads stay flat on the ground (art gap: the pads are baked into the legs, no
// ankle joint). Attack (FF10): it plants (legs splay, the body drops) and lifts the barrel while the
// muzzle charges violet (code draws the charge, scene/enemyFx.ts), fires on the content wind-up's
// end with a recoil, then settles.
import rig from '../../../../art/neon-knights/rigs/bombard.json';
import type { Clip, Keyframe, RigDef } from '../../../themes/types';
import { enemyDeath, enemyHit, idleBob, loop, once, stompBody, stompLeg } from '../clipKit';

const MS = 1400;
/** Middle legs pushed apart (sprite units): far-front back a little, near-rear forward. */
const SPREAD: Record<string, number> = { 'leg-far-front': -2.5, 'leg-near-rear': 2.5 };

const leg = (part: string, phase: number): Keyframe[] =>
  stompLeg(MS, phase, { stride: 4, lift: 6 }).map((k) => ({
    ...k,
    dx: (k.dx ?? 0) + (SPREAD[part] ?? 0),
  }));

const STEPS: [string, number][] = [
  ['leg-far-front', 0],
  ['leg-near-front', 0.25],
  ['leg-near-rear', 0.5],
  ['leg-far-rear', 0.75],
];

/** The Siege wind-up is 700 ms (content); the shell leaves the barrel then. */
export const BOMBARD_FIRE_MS = 700;
const ATTACK_MS = 1200;

/** Feet splay outward while planted (sprite units: front legs forward, rear legs back). */
const PLANT: Record<string, number> = {
  'leg-far-front': 2,
  'leg-near-front': 2,
  'leg-near-rear': -2,
  'leg-far-rear': -2,
};

const plant = (part: string): Keyframe[] => {
  const base = SPREAD[part] ?? 0;
  const out = base + (PLANT[part] ?? 0);
  return [
    { t: 0, dx: base },
    { t: 180, dx: out },
    { t: 1000, dx: out },
    { t: ATTACK_MS, dx: base },
  ];
};

const attack: Clip = once(ATTACK_MS, Object.fromEntries(STEPS.map(([p]) => [p, plant(p)])), {
  body: [
    { t: 0, dy: 0, dx: 0 },
    { t: 180, dy: 3, dx: 0 },
    { t: BOMBARD_FIRE_MS - 40, dy: 3, dx: 0 },
    { t: BOMBARD_FIRE_MS, dy: 5, dx: -3 },
    { t: 900, dy: 3.5, dx: -1 },
    { t: 1000, dy: 3, dx: 0 },
    { t: ATTACK_MS, dy: 0, dx: 0 },
  ],
  // Barrel lifts during the charge (a small tremble at full charge), kicks back on the shot.
  barrel: [
    { t: 0, rot: 0, dx: 0 },
    { t: 450, rot: -12, dx: 0 },
    { t: 560, rot: -11, dx: 0 },
    { t: 620, rot: -12.5, dx: 0 },
    { t: BOMBARD_FIRE_MS - 20, rot: -12, dx: 0 },
    { t: BOMBARD_FIRE_MS, rot: -15, dx: -5 },
    { t: 900, rot: -12, dx: -1 },
    { t: ATTACK_MS, rot: 0, dx: 0 },
  ],
  rack: [
    { t: 0, dy: 0 },
    { t: BOMBARD_FIRE_MS, dy: 1.5 },
    { t: ATTACK_MS, dy: 0 },
  ],
});

export const clips: Record<string, Clip> = {
  idle: idleBob(2200, ['body'], 1, {
    'leg-far-front': [{ t: 0, dx: SPREAD['leg-far-front'] }],
    'leg-near-rear': [{ t: 0, dx: SPREAD['leg-near-rear'] }],
  }),
  walk: loop(MS, ...STEPS.map(([p, phase]) => ({ [p]: leg(p, phase) })), {
    body: stompBody(MS, 4, 2),
  }),
  hit: enemyHit(['body'], 4, 2.5, 300),
  death: enemyDeath(rig as unknown as RigDef, { fall: 440, stagger: 180 }),
  attack,
};
