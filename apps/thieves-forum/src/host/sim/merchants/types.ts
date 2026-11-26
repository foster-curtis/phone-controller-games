// Merchant API (SPEC §6.6, §6.7, §6.9): attention, glance with wind-up, suspicion, dialog, fetch and
// bring forward, coin pick-up, merchant catches.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.
import type { Vec2 } from '../../../content/types';
import type { StepContext } from '../systems';
import type { EntityId, Merchant, Tick } from '../types';

export interface MerchantsApi {
  /**
   * Sends the merchant out from behind his counter to `to` (a coin, an NPC call); he returns after.
   * `reason` (TF8, additive) defaults to `coin` when `merchant.coin` is set, else `call`.
   */
  callAway(ctx: StepContext, merchant: EntityId, to: Vec2, reason?: AwayReason): void;
  /** The back shelf is reachable only while he is `away` (SPEC §6.7). */
  isAway(merchant: Merchant): boolean;
  /** "Just browsing": raise his suspicion of this character (SPEC §6.6). */
  suspect(ctx: StepContext, merchant: EntityId, of: EntityId): void;
}

// ---- TF8 additions: the merchant's desk (`Merchant.desk`) --------------------------------------

/** Why he is out from behind his counter (SPEC §6.7: a coin, an NPC, a guard call). */
export type AwayReason = 'coin' | 'npc' | 'guard' | 'call';

/** What the merchant is doing (SPEC §6.6). Only `away` makes the back shelf reachable (§6.7). */
export type MerchantTask =
  /** Behind the counter with nobody to help. */
  | { k: 'idle' }
  /** Walking along the counter to `customer`, then helping them until `until` (dialog for players). */
  | { k: 'serve'; customer: EntityId; until: Tick; arrived: boolean; dialog: boolean }
  /**
   * A back-shelf item: `get` walks to the shelf (back to the counter), `bring` carries it to the
   * counter in front of `customer`, `stow` takes it back to the shelf. `customer` is null for a stow.
   */
  | { k: 'fetch'; phase: 'get' | 'bring' | 'stow'; slot: number; customer: EntityId | null }
  /** Showing a fetched item to `customer` at the counter until `until`. */
  | { k: 'show'; slot: number; customer: EntityId; until: Tick }
  /** Out from behind the counter: walks `path`, waits at the end until `until`, walks `back`. */
  | {
      k: 'away';
      reason: AwayReason;
      path: Vec2[];
      back: Vec2[];
      until: Tick;
      waiting: boolean;
    };

export interface MerchantDesk {
  /** Customers at his counter (browsing or mid-grab at his stall), in arrival order. */
  queue: EntityId[];
  /** Customers he has already helped while they stay at the counter (he moves on to others). */
  served: EntityId[];
  task: MerchantTask;
  /** A shelf slot he left on the counter (SPEC §6.6); he returns it when he comes back. */
  leftOut: number | null;
}
