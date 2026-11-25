// Ledger keyed by Side (SPEC §6.4, §9 prep). Stub: TF10 implements it.
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are the owner's.
import type { Ledger, Side } from './types';

export type { Ledger, PackEntry, Payee, RoundHaul, Side, SideAccount } from './types';

/** A stable map key for a side. */
export const sideKey = (side: Side): string => `${side.kind}:${side.id}`;

export function createLedger(): Ledger {
  throw new Error('createLedger: not implemented (TF10)');
}
