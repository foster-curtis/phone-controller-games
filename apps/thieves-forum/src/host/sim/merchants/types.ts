// Merchant API (SPEC §6.6, §6.7, §6.9): attention, glance with wind-up, suspicion, dialog, fetch and
// bring forward, coin pick-up, merchant catches.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.
import type { Vec2 } from '../../../content/types';
import type { StepContext } from '../systems';
import type { EntityId, Merchant } from '../types';

export interface MerchantsApi {
  /** Sends the merchant out from behind his counter to `to` (a coin, an NPC call); he returns after. */
  callAway(ctx: StepContext, merchant: EntityId, to: Vec2): void;
  /** The back shelf is reachable only while he is `away` (SPEC §6.7). */
  isAway(merchant: Merchant): boolean;
  /** "Just browsing": raise his suspicion of this character (SPEC §6.6). */
  suspect(ctx: StepContext, merchant: EntityId, of: EntityId): void;
}
