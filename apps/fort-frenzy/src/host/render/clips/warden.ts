// Warden clips (SPEC §2.4): heavy, slow cadence. Attack and super clips arrive with FF8.
import type { Clip } from '../../../themes/types';
import { knightClips, type KnightParts } from '../clipKit';

const parts: KnightParts = {
  root: 'torso',
  legBack: ['backleg'],
  legFront: ['frontleg'],
  legsBoth: ['legs'],
  arms: ['gauntlet'],
  glows: ['torso-glow', 'frontleg-glow', 'helm-glow', 'frontpaul-glow', 'hammer-glow', 'legs-glow', 'pauls-glow'],
  all: ['backpaul', 'backleg', 'torso', 'frontleg', 'helm', 'plume', 'frontpaul', 'hammer', 'gauntlet', 'legs', 'pauls', 'gauntlets'],
};

export const clips: Record<string, Clip> = knightClips(parts, 760, 14);
