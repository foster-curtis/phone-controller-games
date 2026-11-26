// Hooks the NPC mind calls into later subsystems (SPEC §6.10 "NPCs buy and sell for real", technique 5
// coin chasing). TF2 leaves them as no-ops: TF13 sets `buy` to the real NPC purchase (stock, purse,
// `stallChanged`). Kept as one mutable record so the NPC module needs no import from economy code.
import type { StallId } from '../../../content/types';
import type { StepContext } from '../systems';
import type { Character } from '../types';

export interface NpcHooks {
  /** An NPC (or a takeover/walk-on mind) finished browsing its wish-list stall and buys (TF13). */
  buy(ctx: StepContext, buyer: Character, stall: StallId): void;
}

export const NPC_HOOKS: NpcHooks = {
  buy() {},
};
