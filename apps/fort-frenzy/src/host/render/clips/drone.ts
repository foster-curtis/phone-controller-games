// Drone (Grunt) clips (SPEC §9.6): a hunched trot with a knee-bend lift on each forward swing.
// Hit and death are shared (clipKit); the slash arrives with FF6/FF10.
import rig from '../../../../art/neon-knights/rigs/drone.json';
import type { Clip, RigDef } from '../../../themes/types';
import { each, enemyDeath, enemyHit, idleBob, sin, walkerWalk, wave } from '../clipKit';

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
};
