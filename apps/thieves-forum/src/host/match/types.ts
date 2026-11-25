// Match state (SPEC §6.2, §6.14, §6.15, §6.18, §12.3): the flow around the round sims, the party, the
// open stalls (decided once per match, SPEC §11 #24) and the per-side round results. Plain TS: no
// Phaser, no net-client, no DOM (lint). TF10 implements the machine.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.
import type { StallId } from '../../content/types';
import type { PlayerColorId } from '../../shared/theme';
import type { RoundHaul, Side } from '../sim/ledger/types';
import type { PlayerId } from '../sim/types';

export type { RoundHaul, Side } from '../sim/ledger/types';

/** The match flow (SPEC §6.2). `play` and `handsUp` run inside a round sim. */
export const MATCH_PHASES = [
  'lobby',
  'rules',
  'roundStart',
  'play',
  'handsUp',
  'reveal',
  'transition',
  'podium',
] as const;
export type MatchPhase = (typeof MATCH_PHASES)[number];

export interface MatchPlayer {
  id: PlayerId;
  side: Side;
  name: string;
  color: PlayerColorId;
  ready: boolean;
  leader: boolean;
  connected: boolean;
  /** The round they joined in (1-based), 0 = from the lobby (SPEC §6.18 part-match totals). */
  joinedRound: number;
  /** Joined during reveal, transition or podium: waits for the next round start (SPEC §6.18). */
  waiting: boolean;
}

/** One round's results, by side (SPEC §6.14): this round's haul only. */
export interface RoundResult {
  round: number;
  hauls: RoundHaul[];
}

export interface MatchState {
  phase: MatchPhase;
  /** 1-based; 0 in the lobby. */
  round: number;
  rounds: number;
  /** The match seed; each round's seed derives from it. */
  seed: number;
  players: MatchPlayer[];
  /** Open for the whole match (SPEC §6.3). */
  openStalls: StallId[];
  results: RoundResult[];
  /** The How to play card on screen (SPEC §6.19). */
  rulesCard: number;
  /** Phase deadline in host ms (outside the sim), or null. */
  phaseEndsAt: number | null;
}

/** A side's match total: the sum of its round hauls (SPEC §6.4), revealed only on the podium. */
export interface MatchTotal {
  side: Side;
  total: number;
  place: number;
  tied: boolean;
}
