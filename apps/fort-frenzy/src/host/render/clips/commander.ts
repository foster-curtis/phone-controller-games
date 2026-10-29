// Commander clips (SPEC §2.4). The back view has only `swordtip` (art note, BUILD_PLAN §8): its
// track rides on gauntlets like the full sword in the other views. Slash and super arrive with FF9.
import type { Clip } from '../../../themes/types';
import { each, knightClips, wave, sin, type KnightParts } from '../clipKit';

const parts: KnightParts = {
  root: 'torso',
  legBack: ['backleg'],
  legFront: ['frontleg'],
  legsBoth: ['legs'],
  arms: ['gauntlet'],
  glows: ['torso-glow', 'frontleg-glow', 'helm-glow', 'sword-glow', 'legs-glow', 'swordtip-glow', 'banner-glow'],
  all: ['cape', 'backleg', 'torso', 'frontleg', 'helm', 'plume', 'plume-base', 'frontpaul', 'sword', 'gauntlet', 'legs', 'pauls', 'gauntlets', 'swordtip', 'banner', 'banner-cloth'],
};

const base = knightClips(parts, 680, 15);
// The carried banner sways with the walk (it only shows while the `banner` group is on).
const sway = each(['banner'], wave(680, 8, (u) => ({ rot: 3 * sin(u, 0.25) })));
export const clips: Record<string, Clip> = {
  ...base,
  walk: { ...base.walk!, tracks: { ...base.walk!.tracks, ...sway } },
};
