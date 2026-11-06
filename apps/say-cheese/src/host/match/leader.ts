// Session leader (SPEC §6.5, §6.3.1): leadership belongs to a phone. First joiner leads; handoff goes
// to the earliest-joined connected phone, with no snap-back when an earlier one returns.
import type { Player } from './types';

/** The phone's join order is its earliest active seat's. */
function phoneOrder(players: readonly Player[]): Map<string, number> {
  const order = new Map<string, number>();
  for (const p of players) {
    if (p.left || !p.connected) continue;
    const prev = order.get(p.phoneId);
    if (prev === undefined || p.joinIndex < prev) order.set(p.phoneId, p.joinIndex);
  }
  return order;
}

/** Earliest-joined connected phone holding an active seat, or null. */
export function pickLeader(players: readonly Player[]): string | null {
  let best: string | null = null;
  let bestIndex = Infinity;
  for (const [phone, index] of phoneOrder(players)) {
    if (index < bestIndex) [best, bestIndex] = [phone, index];
  }
  return best;
}

/** Keeps the current leader while its phone is connected with a seat; otherwise hands off. */
export function resolveLeader(current: string | null, players: readonly Player[]): string | null {
  if (current !== null && phoneOrder(players).has(current)) return current;
  return pickLeader(players);
}
