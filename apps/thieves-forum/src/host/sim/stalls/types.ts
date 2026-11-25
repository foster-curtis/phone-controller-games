// Stall stock API (SPEC §6.5, §6.6, §6.7): placement, restock, and the private stall view.
// Not a step of its own: merchants and economy call it.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.
import type { Rng } from '@pcg/game-kit';
import type { Content, ShopId, StallId } from '../../../content/types';
import type { StallView } from '../../../shared/viewer/types';
import type { StepContext } from '../systems';
import type { EntityId, StallSlot, World } from '../types';

export interface StallsApi {
  /** A shop's starting slots for a round (§6.5 placement rule and fallback; rares ~1 per stall). */
  stock(rng: Rng, shop: ShopId, content: Content): StallSlot[];
  /** What `viewer` may see of the stall now (taken, too heavy, out of reach). */
  view(world: World, stall: StallId, viewer: EntityId, content: Content): StallView;
  /** Removes the item from a slot (grab or purchase); emits `stallChanged`. */
  take(ctx: StepContext, stall: StallId, slot: number): void;
  /** Puts an item back on the counter (a caught steal, SPEC §6.13); emits `stallChanged`. */
  putBack(ctx: StepContext, stall: StallId, slot: number): void;
}
