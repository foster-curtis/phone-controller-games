// Merchant glance timing and suspicion (SPEC §6.6, §7): a random base interval per glance (4–8 s), made
// shorter by "just browsing" suspicion of a customer at his counter: the glance rate is ×2 at first and
// decays linearly back to ×1 over `suspicion.decayMs`. Pure functions, so the rules test headless.
import type { Rng } from '@pcg/game-kit';
import type { Balance } from '../../../content/types';
import type { EntityId, Merchant, Tick } from '../types';

/** The glance-rate multiplier for one suspicion entry at `tick` (1 = none left). */
export function suspicionFactor(
  until: Tick,
  tick: Tick,
  glanceMult: number,
  decayTicks: number,
): number {
  const left = Math.min(1, Math.max(0, (until - tick) / Math.max(1, decayTicks)));
  return 1 + (glanceMult - 1) * left;
}

/** The strongest suspicion he holds of anyone in `present` now, and who it is (null = nobody). */
export function strongestSuspicion(
  m: Pick<Merchant, 'suspicion'>,
  present: readonly EntityId[],
  tick: Tick,
  glanceMult: number,
  decayTicks: number,
): { of: EntityId | null; factor: number } {
  let best: { of: EntityId | null; factor: number } = { of: null, factor: 1 };
  for (const s of m.suspicion) {
    if (!present.includes(s.of)) continue;
    const f = suspicionFactor(s.until, tick, glanceMult, decayTicks);
    if (f > best.factor || (f === best.factor && best.of !== null && s.of < best.of)) {
      best = { of: s.of, factor: f };
    }
  }
  return best;
}

/** Ticks to the next glance: a fresh base interval from `rng`, divided by the suspicion factor. */
export function glanceIntervalTicks(
  rng: Rng,
  b: Balance['merchants'],
  factor: number,
  ticks: (ms: number) => Tick,
): Tick {
  const [lo, hi] = b.glanceIntervalMs;
  const base = lo + (hi - lo) * rng.next();
  return Math.max(1, Math.round(ticks(base) / factor));
}
