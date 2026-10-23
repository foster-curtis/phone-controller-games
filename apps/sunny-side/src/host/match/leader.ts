// Session leader (SPEC §6.5): first joiner; handoff to the next-earliest joined connected player.
import type { PlayerRecord } from './roster';

/** Earliest-joined connected, non-left player, or null. */
export function pickLeader(players: readonly PlayerRecord[]): string | null {
  let best: PlayerRecord | undefined;
  for (const p of players) {
    if (!p.connected || p.left) continue;
    if (!best || p.joinIndex < best.joinIndex) best = p;
  }
  return best?.id ?? null;
}

/**
 * Keep the current leader while they're connected (no snap-back to an earlier joiner);
 * otherwise hand off.
 */
export function resolveLeader(
  current: string | null,
  players: readonly PlayerRecord[],
): string | null {
  const p = current === null ? undefined : players.find((q) => q.id === current);
  if (p && p.connected && !p.left) return current;
  return pickLeader(players);
}
