// Open-stall rule (SPEC §6.3, §11 #24, §12.4; settled): once per match from the match seed, open the
// pawnbroker, jewelry and one of bakery/pottery, then draw the rest at random from the remaining shops
// until players + 2, clamped 5–10. The set is fixed for the whole match.
import { rngStream } from '@pcg/game-kit';
import { ALWAYS_OPEN, CHEAP_ONE_OF } from '../../content/shops';
import type { Balance, LayoutDef, ShopId, StallId } from '../../content/types';

/** The stream the pick draws from (one per match seed). */
export const OPEN_STALLS_STREAM = 'openStalls';

/** players + openExtra, clamped to [openMin, openMax] (SPEC §7). */
export function openStallCount(players: number, b: Pick<Balance, 'stalls'>): number {
  const { openExtra, openMin, openMax } = b.stalls;
  return Math.min(openMax, Math.max(openMin, players + openExtra));
}

/** The match's open stalls, ascending by stall id. Same seed and player count → same set. */
export function pickOpenStalls(
  seed: number,
  players: number,
  layout: Pick<LayoutDef, 'stalls'>,
  b: Pick<Balance, 'stalls'>,
): StallId[] {
  const rng = rngStream(seed, OPEN_STALLS_STREAM);
  const count = Math.min(openStallCount(players, b), layout.stalls.length);
  const shops: ShopId[] = [...ALWAYS_OPEN, rng.pick(CHEAP_ONE_OF)];
  const rest = layout.stalls.map((s) => s.shop).filter((shop) => !shops.includes(shop));
  // Partial Fisher–Yates over the rest, in layout order, so the draw is stable for a seed.
  for (let i = 0; i < rest.length && shops.length < count; i++) {
    const j = rng.int(i, rest.length - 1);
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
    shops.push(rest[i]!);
  }
  return layout.stalls
    .filter((s) => shops.includes(s.shop))
    .map((s) => s.id)
    .sort((x, y) => x - y);
}
