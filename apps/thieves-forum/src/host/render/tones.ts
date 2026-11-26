// Outfit colors for the rigs (SPEC §6.11, §12.4): fabrics come from the brand kit (`theme.fabric`);
// hair and skin are tone indices the sim rolls, mapped here because the brand kit has no hair or
// skin palette (BUILD_PLAN §8, TF0 decision; flagged for the C0 look). The tones are the art
// delivery's own values (ART_NOTES defaults and the reference files' --hair/--skin), widened.
import type { Outfit } from '../../content/types';
import { theme } from '../../shared/theme';
import type { Tints } from './types';

/** Index 0 is the art's default. */
export const HAIR_TONES: readonly number[] = [0x3b2a20, 0x1f1a17, 0x5a3b26, 0x8a5a32, 0x6b6460];
export const SKIN_TONES: readonly number[] = [0xc8946c, 0xe2b48c, 0x8d5a3b, 0xa8724e, 0x5e3b26];

const tone = (tones: readonly number[], i: number) =>
  tones[((Math.trunc(i) % tones.length) + tones.length) % tones.length]!;

/** One outfit → the citizen rig's slot colors. Players and NPCs go through this one function. */
export function outfitTints(outfit: Outfit): Tints {
  return {
    tunic: theme.fabric[outfit.tunic].num,
    mantle: theme.fabric[outfit.mantle].num,
    hair: tone(HAIR_TONES, outfit.hair),
    skin: tone(SKIN_TONES, outfit.skin),
  };
}

/** A merchant's look (SPEC §6.21): tunic and wrap fabrics, hair (beard) and skin tones. */
export function merchantTints(look: {
  tunic: keyof typeof theme.fabric;
  wrap: keyof typeof theme.fabric;
  hair: number;
  skin: number;
}): Tints {
  return {
    tunic: theme.fabric[look.tunic].num,
    wrap: theme.fabric[look.wrap].num,
    hair: tone(HAIR_TONES, look.hair),
    skin: tone(SKIN_TONES, look.skin),
  };
}

/** Guards wear the delivered uniform; only skin varies. */
export function guardTints(skin: number): Tints {
  return { skin: tone(SKIN_TONES, skin) };
}
