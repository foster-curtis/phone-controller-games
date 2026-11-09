// Scoring (SPEC §6.1, decision #6): +1 per photo a player is tagged in, −1 to the photographer per
// tag, Unknown scores nothing; lowest total wins and ties share the win.
import type { Caught, Standing } from '../../shared/messages';
import type { SeatId } from '../../shared/seats';
import { summary } from './roster';
import type { Player, RoundResult, Tag } from './types';

/** What a round's final tags score. Tags naming nobody (Unknown) count for no one. */
export function scoreRound(r: number, photographer: SeatId, tags: readonly Tag[]): RoundResult {
  const counts = new Map<SeatId, number>();
  let named = 0;
  for (const t of tags) {
    if (t.playerId === null || t.playerId === photographer) continue;
    counts.set(t.playerId, (counts.get(t.playerId) ?? 0) + 1);
    named++;
  }
  return {
    r,
    photographer,
    caught: [...counts].map(([playerId, count]) => ({ playerId, count })),
    photographerDelta: named === 0 ? 0 : -named,
  };
}

/** Adds a round's result to the scores (seats that left since are skipped). */
export function applyResult(players: readonly Player[], result: RoundResult): void {
  const live = (id: SeatId) => players.find((p) => p.id === id && !p.left);
  for (const c of result.caught) {
    const p = live(c.playerId);
    if (p) p.score += c.count;
  }
  const ph = live(result.photographer);
  if (ph) ph.score += result.photographerDelta;
}

/** Catches with names and colors, most caught first (join order on ties). */
export function caughtView(players: readonly Player[], result: RoundResult | null): Caught[] {
  if (!result) return [];
  const out: (Caught & { joinIndex: number })[] = [];
  for (const c of result.caught) {
    const p = players.find((q) => q.id === c.playerId);
    if (p) out.push({ ...summary(p), count: c.count, joinIndex: p.joinIndex });
  }
  out.sort((a, b) => b.count - a.count || a.joinIndex - b.joinIndex);
  return out.map(({ joinIndex: _j, ...c }) => c);
}

/** Match standings, lowest score first; seats that left are gone (SPEC §6.3 Leave = full removal). */
export function standings(players: readonly Player[]): Standing[] {
  return players
    .filter((p) => !p.spectator && !p.left)
    .sort((a, b) => a.score - b.score || a.joinIndex - b.joinIndex)
    .map((p) => ({ ...summary(p), score: p.score, connected: p.connected, left: p.left }));
}

/** Every remaining seat tied on the lowest score. */
export function winners(players: readonly Player[]): SeatId[] {
  const field = players.filter((p) => !p.spectator && !p.left);
  if (field.length === 0) return [];
  const low = Math.min(...field.map((p) => p.score));
  return field.filter((p) => p.score === low).map((p) => p.id);
}
