// Round and match results (SPEC §6.4, §6.14, §6.15): reveal order (lowest haul first, tied top earners
// all crowned), match totals as the sum of round hauls (part-match joiners count only what they
// played), and podium places where ties share a place (1, 1, 3).
import { sideKey } from '../sim/ledger';
import type { MatchTotal, RoundHaul, RoundResult, Side } from './types';

/** Lowest haul → highest; equal hauls keep their given order (join order). Stable. */
export function revealOrder(hauls: readonly RoundHaul[]): RoundHaul[] {
  return hauls
    .map((h, i) => ({ h, i }))
    .sort((a, b) => a.h.haul - b.h.haul || a.i - b.i)
    .map(({ h }) => h);
}

/** Sides with the round's top haul (several on a tie); empty when nobody played. */
export function topEarners(hauls: readonly RoundHaul[]): Side[] {
  if (hauls.length === 0) return [];
  const top = Math.max(...hauls.map((h) => h.haul));
  return hauls.filter((h) => h.haul === top).map((h) => h.side);
}

/**
 * Sum of each side's round hauls over the rounds it appears in, highest first. Places use standard
 * competition ranking: ties share a place and the next place is skipped. `sides` limits the list
 * (players still in the match), in join order for ties; default: every side seen.
 */
export function matchTotals(results: readonly RoundResult[], sides?: readonly Side[]): MatchTotal[] {
  const sums = new Map<string, { side: Side; total: number; order: number }>();
  const add = (side: Side) => {
    const key = sideKey(side);
    if (!sums.has(key)) sums.set(key, { side, total: 0, order: sums.size });
    return sums.get(key)!;
  };
  if (sides) for (const s of sides) add(s);
  for (const r of results) {
    for (const h of r.hauls) {
      if (sides && !sums.has(sideKey(h.side))) continue;
      add(h.side).total += h.haul;
    }
  }
  const rows = [...sums.values()].sort((a, b) => b.total - a.total || a.order - b.order);
  return rows.map((r) => {
    const place = 1 + rows.filter((o) => o.total > r.total).length;
    const tied = rows.some((o) => o !== r && o.total === r.total);
    return { side: r.side, total: r.total, place, tied };
  });
}
