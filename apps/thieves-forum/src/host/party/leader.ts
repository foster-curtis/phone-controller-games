// Party leader (SPEC §6.18): the earliest-joined connected player leads; while they stay connected they
// keep it (no snap-back to an earlier joiner who reconnects). Pattern from Sunny Side's
// `host/match/leader.ts` (reference only, rewritten here). Extraction-ready: no game imports.

/** A player as the leader rule sees them. Pass them in join order. */
export interface LeaderCandidate {
  id: string;
  connected: boolean;
}

/** The earliest-joined connected player, or null. `players` is in join order. */
export function pickLeader(players: readonly LeaderCandidate[]): string | null {
  return players.find((p) => p.connected)?.id ?? null;
}

/** Keeps `current` while they're present and connected; otherwise hands off to `pickLeader`. */
export function resolveLeader(
  current: string | null,
  players: readonly LeaderCandidate[],
): string | null {
  const p = current === null ? undefined : players.find((q) => q.id === current);
  if (p?.connected) return current;
  return pickLeader(players);
}
