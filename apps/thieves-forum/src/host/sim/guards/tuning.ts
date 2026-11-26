// TF9 build tuning for guards and catches (SPEC §6.12, §6.13): the numbers §7 doesn't give, kept in one
// place beside the code (src/content/ isn't TF9's; BUILD_PLAN §8). Not frozen; starting values judged at
// C2. Every §7 value stays in src/content/balance.ts. Units: ms and tiles.

export const GUARD_TUNING = {
  /** How long the red "!" shows over a guard after a spot (SPEC §6.12). */
  bangMs: 1200,
  /** A guard counts as at a patrol point (or the stocks front) within this distance. */
  arrive: 0.3,
  /** The caught beat (starburst, catch pose) before the march starts or the thief is let go. */
  caughtMs: 900,
  /** The march to the stocks gives up waiting and locks the thief in after this long. */
  marchMaxMs: 20_000,
  /** The thief walks this far behind the guard on the march. */
  marchGap: 0.8,
  /** Where a thief stands to be locked in or let out: this far in front of the stocks. */
  stocksFront: 0.7,
} as const;
