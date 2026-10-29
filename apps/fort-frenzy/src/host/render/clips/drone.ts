// Drone (Grunt) clips (SPEC §9.6): a hunched trot. The slash arrives with FF6/FF10.
import type { Clip } from '../../../themes/types';
import { each, idleBob, sin, walkerWalk, wave } from '../clipKit';

export const clips: Record<string, Clip> = {
  idle: idleBob(1400, ['torso'], 1, each(['arm-near'], wave(1400, 4, (u) => ({ rot: 3 * sin(u) })))),
  walk: walkerWalk(
    520,
    ['torso'],
    ['leg-far'],
    ['leg-near'],
    20,
    2,
    each(['arm-near', 'arm-far'], wave(520, 8, (u) => ({ rot: 5 * sin(u, 0.25) }))),
  ),
};
