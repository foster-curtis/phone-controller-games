// The ledger a round's catches pay through (SPEC §6.13, §9 prep). The frozen `StepContext` carries no
// ledger, so the host wiring attaches the round's ledger (TF10's `createLedger`) to its world once with
// `attachLedger`; tests attach a fake. Kept beside `World`, not in it (like `derived.ts`), so the state
// hash and the frozen `World` shape stay as they are. No ledger attached: catches move no money.
import type { Ledger } from '../ledger/types';
import type { World } from '../types';

const ledgers = new WeakMap<World, Ledger>();

export function attachLedger(world: World, ledger: Ledger): void {
  ledgers.set(world, ledger);
}

export const ledgerOf = (world: World): Ledger | null => ledgers.get(world) ?? null;
