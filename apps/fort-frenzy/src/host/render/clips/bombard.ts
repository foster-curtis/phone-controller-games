// Bombard (Siege) clips (SPEC §9.6): plods on four splayed legs. Plant and fire arrive with FF10.
import type { Clip } from '../../../themes/types';
import { idleBob, walkerWalk } from '../clipKit';

export const clips: Record<string, Clip> = {
  idle: idleBob(2200, ['body'], 1),
  walk: walkerWalk(1100, ['body'], ['leg-far-rear', 'leg-near-front'], ['leg-far-front', 'leg-near-rear'], 10, 2),
};
