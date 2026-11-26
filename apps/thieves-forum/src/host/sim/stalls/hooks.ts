// The round's ledger as stall theft sees it (SPEC §6.4, §6.7; §9 prep: keyed by `Side`). The sim has no
// ledger of its own: the host wiring (TF12) sets `ledger` at round start, and tests set a fake. Kept as
// one mutable record, like `NPC_HOOKS`, so the sim needs no import from match code. Null = no ledger
// (headless crowd runs): grabbed items still leave the stall, and nothing reads "too heavy".
import type { Ledger } from '../ledger/types';

export interface TheftHooks {
  ledger: Ledger | null;
}

export const THEFT_HOOKS: TheftHooks = { ledger: null };
