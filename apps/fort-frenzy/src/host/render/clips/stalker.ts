// Stalker (Hunter) clips (SPEC §9.6): a fast loping run. Crouch and lunge arrive with FF10.
import type { Clip } from '../../../themes/types';
import { each, idleBob, sin, walkerWalk, wave } from '../clipKit';

export const clips: Record<string, Clip> = {
  idle: idleBob(
    1600,
    ['body'],
    1,
    each(
      ['tail'],
      wave(1600, 8, (u) => ({ rot: 6 * sin(u) })),
    ),
  ),
  walk: walkerWalk(
    440,
    ['body'],
    ['leg-far-rear', 'leg-near-rear'],
    ['leg-far-front', 'leg-near-front'],
    24,
    2.5,
    {
      body: wave(440, 8, (u) => ({ dy: -2.5 * Math.abs(sin(u)), rot: 3 * sin(u) })),
      tail: wave(440, 8, (u) => ({ rot: 10 * sin(u, 0.25) })),
    },
  ),
};
