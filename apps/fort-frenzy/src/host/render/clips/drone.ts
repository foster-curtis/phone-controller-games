// Drone (Grunt) clips (SPEC §9.6): a hunched trot with a knee-bend lift on each forward swing.
// Hit and death are shared (clipKit). The attack (FF7) is the Grunt's melee slash: a wind-up with the
// blade arm raised, then a lunge and a downward cut.
import rig from '../../../../art/neon-knights/rigs/drone.json';
import type { Clip, RigDef } from '../../../themes/types';
import { each, enemyDeath, enemyHit, idleBob, once, sin, walkerWalk, wave } from '../clipKit';

/** The Grunt's wind-up is 250 ms (content); the cut lands then. */
export const DRONE_STRIKE_MS = 250;

const attack: Clip = once(
  480,
  {
    torso: [
      { t: 0, rot: 0, dx: 0 },
      { t: 180, rot: -6, dx: -2 },
      { t: DRONE_STRIKE_MS, rot: 10, dx: 5 },
      { t: 480, rot: 0, dx: 0 },
    ],
    head: [
      { t: 0, rot: 0 },
      { t: 180, rot: -4 },
      { t: DRONE_STRIKE_MS, rot: 6 },
      { t: 480, rot: 0 },
    ],
    // Blade up and back, then a fast cut down through the target.
    'arm-near': [
      { t: 0, rot: 0 },
      { t: 180, rot: -55 },
      { t: DRONE_STRIKE_MS, rot: 38 },
      { t: 340, rot: 30 },
      { t: 480, rot: 0 },
    ],
    'arm-far': [
      { t: 0, rot: 0 },
      { t: 180, rot: 12 },
      { t: DRONE_STRIKE_MS, rot: -10 },
      { t: 480, rot: 0 },
    ],
  },
  {
    'leg-near': [
      { t: 0, rot: 0 },
      { t: DRONE_STRIKE_MS, rot: -10 },
      { t: 480, rot: 0 },
    ],
  },
);

export const clips: Record<string, Clip> = {
  idle: idleBob(
    1400,
    ['torso'],
    1,
    each(
      ['arm-near'],
      wave(1400, 4, (u) => ({ rot: 3 * sin(u) })),
    ),
  ),
  walk: walkerWalk(
    520,
    ['torso'],
    ['leg-far'],
    ['leg-near'],
    20,
    2.2,
    each(
      ['arm-near', 'arm-far'],
      wave(520, 8, (u) => ({ rot: 5 * sin(u, 0.25) })),
    ),
    0.16,
  ),
  hit: enemyHit(['torso'], 8, 3),
  death: enemyDeath(rig as unknown as RigDef),
  attack,
};
