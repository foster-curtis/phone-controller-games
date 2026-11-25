// Sim events (SPEC §12.3): what happened this step, for the scene, the audio, the TV HUD and the phones.
// Every event is tagged `ch: 'tv'` or `ch: 'phone'`. The scene, the HUD and the audio consume only `tv`
// events, which carry entity ids and never a player id; `phone` events carry the `PlayerId` they're for
// and are routed privately (host/net, TF12). There is deliberately no `tv` event for a successful grab,
// a successful pickpocket or a tip payout (SPEC §6.11): a grab only shows as `stallChanged`, which
// identifies a stall, not a player (NPC purchases emit it too).
// Frozen at TF0 (BUILD_PLAN §3). Append-only registry (BUILD_PLAN §2): add members, never remove.
import type { ItemId, StallId, Vec2 } from '../../content/types';
import type { HoldKind, HoldResult } from '../../shared/hold';
import type { ActivationCause, EntityId, PlayerId } from './types';

/** TV events: visible to everyone in the room (SPEC §6.16 "visible events"). */
export type TvEvent = { ch: 'tv' } & (
  | { e: 'phase'; phase: 'opening' | 'play' | 'handsUp' | 'rush' | 'ended' }
  | { e: 'gate'; open: boolean }
  | { e: 'stallChanged'; stall: StallId }
  | { e: 'glanceWindup'; by: EntityId } // merchant or NPC head turn (swoosh)
  | { e: 'glanceLook'; by: EntityId }
  | { e: 'shout'; by: EntityId; at: EntityId } // point-and-shout "THIEF!"
  | { e: 'guardSpot'; guard: EntityId; at: EntityId } // cone red + "!"
  | { e: 'guardGiveUp'; guard: EntityId }
  | { e: 'reinforcement'; guard: EntityId }
  | { e: 'coinToss'; by: EntityId; coin: number; from: Vec2; to: Vec2 }
  | { e: 'coinLanded'; coin: number; at: Vec2 }
  | { e: 'coinPicked'; coin: number; by: EntityId }
  | { e: 'merchantQuestion'; merchant: EntityId } // "?" over a merchant
  /** An in-person grab: the TV shows the grab either way (SPEC §6.13). */
  | { e: 'grabAttempt'; by: EntityId; at: EntityId; right: boolean }
  /** Any catch: starburst over the thief, the pot flies to `to` (catcher or guard). */
  | { e: 'caught'; thief: EntityId; to: EntityId; coins: number }
  | { e: 'stocksIn'; character: EntityId; slot: number; releaseAt: number }
  | { e: 'stocksOut'; character: EntityId }
  | { e: 'enter'; character: EntityId } // walked on from an entry (NPC or walk-on, identical)
  | { e: 'exit'; character: EntityId } // walked off the map (NPC or leaver, identical)
);

/** Phone events: private to one player, never shown on the TV (SPEC §6.11, §6.17). */
export type PhoneEvent = { ch: 'phone'; player: PlayerId } & (
  | {
      e: 'holdStart';
      hold: number;
      kind: HoldKind;
      durationMs: number;
      stall?: StallId;
      slot?: number;
    }
  | { e: 'holdEnd'; hold: number; result: HoldResult }
  | { e: 'grabbed'; item: ItemId; value: number }
  | { e: 'pickpocketed'; amount: number; lucky: boolean }
  | { e: 'robbed'; amount: number } // "Your purse feels lighter… −N"
  | { e: 'bought'; item: ItemId; price: number }
  | { e: 'sold'; item: ItemId; price: number; lucky: boolean }
  | { e: 'tossed'; cost: number }
  | { e: 'wrongGrab'; penalty: number }
  | { e: 'rightGrab'; pot: number }
  | { e: 'caught'; pot: number; by: 'player' | 'guard' }
  | { e: 'stocks'; releaseAt: number }
  | { e: 'released' }
  | { e: 'tipResult'; tip: number; result: 'landed' | 'missed' | 'expired'; fee: number }
  | { e: 'tipPayout'; amount: number }
  | { e: 'bagChanged' }
  | { e: 'stallView'; stall: StallId | null } // (re)send this stall's view, or close it
  | { e: 'dialog'; open: boolean; stall: StallId }
  | { e: 'sellSheet'; buyer: EntityId | null }
  | { e: 'pawnSheet'; open: boolean }
  | { e: 'context' } // the main button's context may have changed
  | { e: 'handOff' } // walk-on: "Your turn!"
);

export type SimEvent = TvEvent | PhoneEvent;

/** The scene, HUD and audio filter with this; it is the disguise boundary (SPEC §12.3). */
export const isTvEvent = (e: SimEvent): e is TvEvent => e.ch === 'tv';

/** Activation bookkeeping shared by guards and catches (SPEC §6.12). */
export interface Activation {
  cause: ActivationCause;
  thief: EntityId;
  tick: number;
}
