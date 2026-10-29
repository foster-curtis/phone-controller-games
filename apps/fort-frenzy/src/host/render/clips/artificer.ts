// Artificer clips (SPEC §2.4). The backpack gauge is optional groups (`core<N>-full|half`), switched
// by code from the cells carried. Bolts, cone and throw arrive with FF9.
import type { Clip } from '../../../themes/types';
import { knightClips, type KnightParts } from '../clipKit';

const parts: KnightParts = {
  root: 'torso',
  legBack: ['backleg'],
  legFront: ['frontleg'],
  legsBoth: ['legs'],
  arms: ['frontarm'],
  glows: ['torso-glow', 'frontleg-glow', 'helm-glow', 'frontarm-glow', 'legs-glow', 'arms-glow'],
  all: [
    'pack',
    'cell1',
    'cell2',
    'cell3',
    'slots',
    'backleg',
    'torso',
    'frontleg',
    'helm',
    'helmcap',
    'bezel',
    'frontarm',
    'legs',
    'arms',
  ],
};

export const clips: Record<string, Clip> = knightClips(parts, 680, 15);
