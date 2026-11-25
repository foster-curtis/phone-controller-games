// NPC crowd API (SPEC §6.10, §12.3): spawning shoppers and their minds (all five techniques). Its own
// module because the disguise depends on it (SPEC §5). Also drives takeover and walk-on characters.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.
import type { Rng } from '@pcg/game-kit';
import type { Content, EntryId } from '../../../content/types';
import type { StepContext } from '../systems';
import type { Character, Npc } from '../types';

export interface NpcApi {
  /** A fresh mind: personality, wish list, wants, purse and sale rate rolled from `rng`. */
  createMind(rng: Rng, content: Content): Npc;
  /** Spawns a new NPC shopper just off screen at `entry`, walking in. */
  spawn(ctx: StepContext, entry: EntryId): Character;
}
