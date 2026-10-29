// Automaton footman clips (SPEC §2.4): idle and march. The side view has no free hand (art note,
// BUILD_PLAN §8), so only the blade hand swings. Stab and collapse arrive with FF9.
import type { Clip } from '../../../themes/types';
import { each, idleBob, sin, walkerWalk, wave } from '../clipKit';

export const clips: Record<string, Clip> = {
  idle: idleBob(1500, ['torso'], 0.8),
  walk: walkerWalk(
    480,
    ['torso'],
    ['leg-far', 'leg-l'],
    ['leg-near', 'leg-r'],
    18,
    1.5,
    each(['hand', 'hand-free'], wave(480, 8, (u) => ({ rot: 8 * sin(u) }))),
  ),
};
