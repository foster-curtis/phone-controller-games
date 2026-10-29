// Ranger clips (SPEC §2.4): a quicker, lighter walk than the Warden. Steady Aim is the `ready` pose
// crossfade (RigInstance.setPose); the shot and super arrive with FF6/FF7. The back views have no
// quiver strap (art note, BUILD_PLAN §8), so no clip moves one there.
import type { Clip } from '../../../themes/types';
import { knightClips, type KnightParts } from '../clipKit';

const parts: KnightParts = {
  root: 'torso',
  legBack: ['backleg'],
  legFront: ['frontleg'],
  legsBoth: ['legs'],
  arms: ['backarm', 'frontarm'],
  glows: [
    'quiver-glow',
    'strap-glow',
    'frontleg-glow',
    'helm-glow',
    'bow-glow',
    'quivertips-glow',
    'legs-glow',
  ],
  all: [
    'quiver',
    'cloak',
    'backleg',
    'backarm',
    'torso',
    'strap',
    'frontleg',
    'helm',
    'plume',
    'bow',
    'frontarm',
    'quivertips',
    'legs',
    'arms',
    'hands',
    'paul-l',
    'paul-r',
    'pauls',
  ],
};

export const clips: Record<string, Clip> = knightClips(parts, 560, 18);
