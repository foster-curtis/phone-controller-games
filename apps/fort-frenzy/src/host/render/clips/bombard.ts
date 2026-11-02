// Bombard (Siege) clips (SPEC §9.6): plods on four splayed legs (C1 note 3). A four-beat walk: each
// leg steps on its own quarter of the cycle, and the two middle legs (far-front, near-rear) step
// half a cycle apart and stand a little apart, so they read as two legs. The legs translate rather
// than turn, so the foot pads stay flat on the ground (art gap: the pads are baked into the legs, no
// ankle joint). Plant and fire arrive with FF10.
import rig from '../../../../art/neon-knights/rigs/bombard.json';
import type { Clip, Keyframe, RigDef } from '../../../themes/types';
import { enemyDeath, enemyHit, idleBob, loop, stompBody, stompLeg } from '../clipKit';

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
};
