// Economy API (SPEC §6.4, §6.5): low-weighted rolls, buying, the pawnbroker, NPC selling and buying,
// restock.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.
import type { Rng } from '@pcg/game-kit';
import type { ItemId, Range } from '../../../content/types';
import type { StepContext } from '../systems';
import type { EntityId, PlayerId, World } from '../types';

export interface EconomyApi {
  /** `min + (max − min) × r^skew` (SPEC §6.4); callers floor money. */
  roll(rng: Rng, range: Range, skew: number): number;
  /** Today's pawnbroker offer for an item (rate of the moment, floored). */
  pawnOffer(world: World, item: ItemId): number;
  /** An NPC's offer for an item on its wish list (its sale rate, floored), or null. */
  npcOffer(world: World, npc: EntityId, item: ItemId): number | null;
  buy(ctx: StepContext, player: PlayerId, item: ItemId): boolean;
  sell(ctx: StepContext, player: PlayerId, item: ItemId, to: 'pawn' | EntityId): boolean;
}
