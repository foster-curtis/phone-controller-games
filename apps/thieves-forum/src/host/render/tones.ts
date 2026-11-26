// Outfit colors for the rigs (SPEC §6.11, §12.4): fabrics come from the brand kit (`theme.fabric`);
// hair and skin are tone indices the sim rolls, mapped here because the brand kit has no hair or
// skin palette (BUILD_PLAN §8, TF0 decision). The tables match the phone's outfit card (TF5) so
// both screens agree; flag for C1.
import type { Outfit } from '../../content/types';
import { theme } from '../../shared/theme';
import type { Tints } from './types';

/**
 * The same tables, in the same order, as the phone's outfit card (`src/controller/outfit.ts`, TF5),
 * so a tone index reads the same color on the TV and the phone (BUILD_PLAN §8). The art's defaults
 * are hair 1 (#3b2a20) and skin 2 (#c8946c).
 */
export const SKIN_TONES: readonly number[] = [
  0xf0c8a0, 0xd9a577, 0xc8946c, 0xa8744f, 0x8a5a3c, 0x6b4429,
];
export const HAIR_TONES: readonly number[] = [
  0x14100c, 0x3b2a20, 0x5a3b26, 0x8a5a2b, 0xb58a4a, 0xa8a8a8,
];
export const DEFAULT_HAIR = 1;
export const DEFAULT_SKIN = 2;

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
