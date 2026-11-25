// Lifecycle API (SPEC §6.2, §6.10, §6.11, §6.18): outfits, crowd size, walk-on joins, takeover, leave.
// `assignOutfit` is one function callable mid-round (SPEC §9 outfit-stall prep).
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.
import type { Rng } from '@pcg/game-kit';
import type { Outfit, OutfitPool } from '../../../content/types';

/** Draws a fresh outfit from the shared pool (players and NPCs alike, SPEC §6.11). */
export type AssignOutfit = (rng: Rng, pool: OutfitPool) => Outfit;

/** The planned NPC count and its tolerance band (SPEC §6.10). */
export interface CrowdBand {
  planned: number;
  min: number;
  max: number;
}
