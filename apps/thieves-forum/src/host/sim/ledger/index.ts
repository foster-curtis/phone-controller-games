// Ledger keyed by Side (SPEC §6.4, §6.13, §9 prep): purse, pack, haul, pot and the payout table. Money
// is whole denarii; a debit takes at most what the side has, so a bag never goes below 0 (a haul can).
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are the owner's.
// TF10 adds `settleCatch`, `chargeWrongGrab`, `chargeTipFee` and `roundHauls` (contract+).
import { balance } from '../../../content/balance';
import type { Balance, ItemId } from '../../../content/types';
import type { Ledger, PackEntry, Payee, RoundHaul, Side, SideAccount } from './types';

export type { Ledger, PackEntry, Payee, RoundHaul, Side, SideAccount } from './types';

/** A stable map key for a side. */
export const sideKey = (side: Side): string => `${side.kind}:${side.id}`;

const isSide = (p: Payee): p is Side => typeof p === 'object';
const whole = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
const weightOf = (pack: readonly PackEntry[]): number => pack.reduce((s, e) => s + e.weight, 0);

/** `packCapacity` defaults to `balance.match.packCapacity` (SPEC §7: 15). */
export function createLedger(packCapacity: number = balance.match.packCapacity): Ledger {
  const accounts = new Map<string, SideAccount>();
  const get = (side: Side) => accounts.get(sideKey(side)) ?? null;

  const ledger: Ledger = {
    open(side, startPurse) {
      const acc: SideAccount = { side: { ...side }, purse: startPurse, pack: [], startPurse };
      accounts.delete(sideKey(side));
      accounts.set(sideKey(side), acc);
      return acc;
    },
    account: get,
    credit(side, amount) {
      const acc = get(side);
      if (acc) acc.purse += whole(amount);
    },
    debit(side, amount, to) {
      const acc = get(side);
      if (!acc) return 0;
      const taken = Math.min(whole(amount), Math.max(acc.purse, 0));
      acc.purse -= taken;
      if (isSide(to)) ledger.credit(to, taken);
      return taken;
    },
    addItem(side, entry) {
      const acc = get(side);
      if (!acc || weightOf(acc.pack) + entry.weight > packCapacity) return false;
      acc.pack.push({ ...entry });
      return true;
    },
    removeItem(side, item: ItemId) {
      const acc = get(side);
      const i = acc ? acc.pack.findIndex((e) => e.item === item) : -1;
      return i < 0 ? null : acc!.pack.splice(i, 1)[0]!;
    },
    packWeight: (side) => weightOf(get(side)?.pack ?? []),
    pot(side, share) {
      const acc = get(side);
      return acc ? Math.floor(Math.max(acc.purse, 0) * share) : 0;
    },
    haul(side) {
      const acc = get(side);
      if (!acc) return 0;
      return acc.purse + acc.pack.reduce((s, e) => s + e.value, 0) - acc.startPurse;
    },
    sides: () => [...accounts.values()].map((a) => ({ ...a.side })),
  };
  return ledger;
}

// ---- TF10 additions (contract+): the payout table and fees, so every catcher pays the same way ----

/** Who made a catch (SPEC §6.13 payout table). Merchant and NPC glances take no pot. */
export type CatchBy =
  | { by: 'player'; catcher: Side }
  | { by: 'tip'; tipper: Side }
  /** Spot or alert chase. */
  | { by: 'guard' };

/** Where a pot went. `pot` = catcher + tipper + guard. */
export interface Settlement {
  pot: number;
  catcher: number;
  tipper: number;
  guard: number;
}

/**
 * Takes the thief's pot (`floor(bag × catch.potShare)`) and pays it out: a player catcher gets all of
 * it; on a tip-off the tipper gets `floor(pot × tip.share)` and the guard keeps the rest; a guard's own
 * catch keeps it all. Items are never touched.
 */
export function settleCatch(
  ledger: Ledger,
  thief: Side,
  how: CatchBy,
  b: Pick<Balance, 'catch' | 'tip'> = balance,
): Settlement {
  const pot = ledger.pot(thief, b.catch.potShare);
  if (how.by === 'player') {
    const paid = ledger.debit(thief, pot, how.catcher);
    return { pot: paid, catcher: paid, tipper: 0, guard: 0 };
  }
  if (how.by === 'tip') {
    const tipper = ledger.debit(thief, Math.floor(pot * b.tip.share), how.tipper);
    const guard = ledger.debit(thief, pot - tipper, 'guard');
    return { pot: tipper + guard, catcher: 0, tipper, guard };
  }
  const guard = ledger.debit(thief, pot, 'guard');
  return { pot: guard, catcher: 0, tipper: 0, guard };
}

/** Wrong in-person grab (SPEC §6.13): returns what was taken (at most the bag). */
export const chargeWrongGrab = (
  ledger: Ledger,
  side: Side,
  b: Pick<Balance, 'catch'> = balance,
): number => ledger.debit(side, b.catch.wrongGrabPenalty, 'sink');

/** The tip-off fee (SPEC §6.13), paid on send whether it lands or not. */
export const chargeTipFee = (ledger: Ledger, side: Side, b: Pick<Balance, 'tip'> = balance): number =>
  ledger.debit(side, b.tip.fee, 'sink');

/** Every side's round result (SPEC §6.14), in the order the sides were opened. */
export function roundHauls(ledger: Ledger): RoundHaul[] {
  return ledger.sides().map((side) => {
    const acc = ledger.account(side)!;
    return {
      side,
      bag: acc.purse,
      items: acc.pack.map((e) => ({ ...e })),
      haul: ledger.haul(side),
    };
  });
}
