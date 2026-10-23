// Match flow contract (SPEC §6.3, §6.5, §6.7): roster, leader, rounds, scoring, screens.
// Plain TS: no Phaser, no networking (M6 wires it to the host client). Frozen at F0: additive only.
import type {
  EmojiIndex,
  HostMsg,
  LeaderAction,
  PlayerColorId,
  RoundBreakdown,
} from '../../shared/messages';
import type { Sim, SimEvent } from '../sim/types';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** A phone as the relay reports it (mirrors net-client's RosterEntry; match must not import it). */
export interface RelayPeer {
  playerId: string;
  playerKey: string;
  connected: boolean;
}

export interface MatchDeps {
  sim: Sim;
  /** `to` omitted = broadcast. */
  send(msg: HostMsg, to?: string): void;
  /** Frees the relay slot and invalidates the phone's token. */
  kick(playerId: string): void;
  /** sessionStorage: roster / scores / leader / round persist here for host-refresh restore. */
  storage: StorageLike;
}

export type MatchPhase = 'lobby' | 'countdown' | 'playing' | 'results' | 'matchEnd';

export interface PlayerView {
  id: string;
  playerKey: string;
  name: string;
  color: PlayerColorId | null;
  score: number;
  connected: boolean;
  left: boolean;
  /** Joined mid-match: watches until the next round. */
  spectating: boolean;
  selfPaused: boolean;
  isLeader: boolean;
  /** Has an egg on the pan this round. */
  alive: boolean;
  ghost: boolean;
  /** Join order (leader handoff, standings tie-break). */
  joinIndex: number;
}

/** Everything the TV renders that isn't physics. */
export interface MatchView {
  phase: MatchPhase;
  /** Host tab hidden: sim must not step. */
  paused: boolean;
  round: number;
  targetScore: number;
  leaderId: string | null;
  /** ms left in the round-start countdown (phase `countdown`), else 0. */
  countdownMs: number;
  /** All players ever in this match, in join order (left players included, greyed). */
  players: PlayerView[];
  /** Round result (phase `results`): sole survivor who got +3, if any. */
  survivorId: string | null;
  /** Phase `matchEnd`. */
  winnerId: string | null;
  /**
   * Phases `results` / `matchEnd`: points breakdown of the round just played (M3-fix-1). null in
   * other phases and after a host-refresh restore (in-round state isn't persisted).
   */
  breakdown?: RoundBreakdown | null;
}

export type MatchEvent =
  | { type: 'phase'; phase: MatchPhase }
  | { type: 'score'; playerId: string; delta: number; reason: 'knockout' | 'survivor' }
  | { type: 'emoji'; playerId: string; i: EmojiIndex }
  | { type: 'leader'; playerId: string | null }
  | { type: 'roster' };

export interface Match {
  // relay → match
  playerJoined(playerId: string, playerKey: string): void;
  playerLeft(playerId: string): void;
  playerRejoined(playerId: string, playerKey: string): void;
  /** Any phone message (input tuples included); invalid payloads are ignored. */
  handleMessage(from: string, data: unknown): void;
  /** After a host refresh + reclaim: restore from storage, reconcile with the roster, go to results. */
  restore(roster: readonly RelayPeer[]): void;
  // host → match
  /** Host-side controls (same actions as the leader's phone). */
  hostAction(action: LeaderAction): void;
  setHostVisible(visible: boolean): void;
  // loop → match
  handleSimEvents(events: readonly SimEvent[]): void;
  /** Advance match timers (countdown, respawn countdowns, emoji rate limit). */
  tick(dtMs: number): void;
  /** True while the loop should step the sim (phase `playing` and not paused). */
  readonly simRunning: boolean;
  view(): MatchView;
  onEvent(cb: (event: MatchEvent) => void): () => void;
}

export function createMatch(_deps: MatchDeps): Match {
  throw new Error('createMatch: not implemented (M3)');
}
