// Ledger API (SPEC §6.4, §6.13; §9 prep): purse, pack, haul, pot and payouts keyed by `Side`, so pairs
// mode later keys by team without touching callers.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.
import type { ItemId } from '../../../content/types';

/** Who scores (SPEC §9 prep): a player in v1, a team later. */
export type Side = { kind: 'player'; id: string };

export interface PackEntry {
  item: ItemId;
  value: number;
  weight: number;
}

export interface SideAccount {
  side: Side;
  /** The bag, denarii. */
  purse: number;
  pack: PackEntry[];
  /** This round's starting purse (haul baseline). */
  startPurse: number;
}

/** Where money goes when it leaves a side: another side, the guard (pot kept) or nowhere (fees). */
export type Payee = Side | 'guard' | 'sink';

export interface Ledger {
  /** Fresh purse and empty pack for the round (SPEC §6.4). */
  open(side: Side, startPurse: number): SideAccount;
  account(side: Side): SideAccount | null;
  /** Adds money (grab, sale, pickpocket take, payout). */
  credit(side: Side, amount: number): void;
  /** Takes up to `amount` (all they have, if less); returns what was taken. */
  debit(side: Side, amount: number, to: Payee): number;
  addItem(side: Side, entry: PackEntry): boolean;
  removeItem(side: Side, item: ItemId): PackEntry | null;
  packWeight(side: Side): number;
  /** The pot: `floor(purse × share)` (SPEC §6.13). */
  pot(side: Side, share: number): number;
  /** End bag + full pack value − starting purse (SPEC §6.4); may be negative. */
  haul(side: Side): number;
  sides(): Side[];
}

/** One side's round result (SPEC §6.14). */
export interface RoundHaul {
  side: Side;
  bag: number;
  items: PackEntry[];
  haul: number;
}
