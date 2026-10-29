// Brute clips (SPEC §9.6): a heavy stomp. The wall-hit tell arrives with FF10.
import type { Clip } from '../../../themes/types';
import { each, idleBob, sin, walkerWalk, wave } from '../clipKit';

export const clips: Record<string, Clip> = {
  idle: idleBob(2000, ['torso'], 1.5),
  walk: walkerWalk(
    1000,
    ['torso'],
    ['leg-far'],
    ['leg-near'],
    12,
    3,
    each(['arm-near', 'arm-far'], wave(1000, 8, (u) => ({ rot: 4 * sin(u, 0.5) }))),
  ),
};
