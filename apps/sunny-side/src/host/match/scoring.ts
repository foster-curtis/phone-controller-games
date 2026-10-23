// Scoring (SPEC §6.1): +1 per knockout credit, +3 to the sole survivor; target by player count.
import { MIN_PLAYERS, TARGET_SCORES, TARGET_SCORE_MANY } from './config';
import type { PlayerRecord, Roster } from './roster';

export function targetScoreFor(playerCount: number): number {
  const n = Math.max(MIN_PLAYERS, playerCount);
  return TARGET_SCORES[n] ?? TARGET_SCORE_MANY;
}

/** An egg still "in play": its owner hasn't left and hasn't late-rejoined under a new id. */
export function isLiveEgg(roster: Roster, eggId: string): boolean {
  const owner = roster.current(eggId);
  return !!owner && !owner.left;
}

/** Who gets +1 for an elimination: the credited player, unless unknown, self, or left. */
export function knockoutCredit(
  roster: Roster,
  eliminatedId: string,
  by: string | null,
): PlayerRecord | null {
  if (by === null || by === eliminatedId) return null;
  const killer = roster.get(by);
  const victim = roster.get(eliminatedId);
  if (!killer || killer.left || killer === victim) return null;
  return killer;
}

export interface RoundOutcome {
  over: boolean;
  /** Gets +3 (round over with exactly one live egg left). */
  survivor: PlayerRecord | null;
}

/**
 * Round end (Build decisions): ≤1 egg on the pan, or no remaining egg belongs to a
 * connected/reconnecting player. +3 only to a sole remaining egg whose owner hasn't left.
 */
export function roundOutcome(roster: Roster, eggsOnPan: ReadonlySet<string>): RoundOutcome {
  const remaining = [...eggsOnPan];
  const live = remaining.filter((id) => isLiveEgg(roster, id));
  if (remaining.length > 1 && live.length > 0) return { over: false, survivor: null };
  const sole = remaining.length === 1 && live.length === 1 ? roster.current(live[0]!) : undefined;
  return { over: true, survivor: sole ?? null };
}

/** The unique highest score ≥ target among players still in the match, else null (another round). */
export function findWinner(players: readonly PlayerRecord[], target: number): PlayerRecord | null {
  const inMatch = players.filter((p) => !p.left);
  if (inMatch.length === 0) return null;
  const top = Math.max(...inMatch.map((p) => p.score));
  if (top < target) return null;
  const leaders = inMatch.filter((p) => p.score === top);
  return leaders.length === 1 ? leaders[0]! : null;
}
