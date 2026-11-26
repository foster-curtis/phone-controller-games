// TF8 build tuning for merchants and stall browsing (SPEC §6.6, §6.7): the numbers §7 and
// `balance.merchants` don't give, kept in one place. Not frozen; values are starting points judged at
// C2. Move them into `src/content/balance.ts` when its owner next edits it (BUILD_PLAN §8 [TF8]).
// Units: ms, tiles, fractions.

export const MERCHANT_TUNING = {
  /** How long he helps an NPC customer before moving on, ms. */
  helpMs: [2000, 4000] as const,
  /** A player's dialog closes by itself after this long with no pick (read as Leave), ms. */
  dialogMs: 8000,
  /** How long he shows a fetched shelf item at the counter, ms. */
  showMs: 3000,
  /** Shouting and pointing after a merchant catch, ms (SPEC §6.6). */
  shoutMs: 2500,
  /** Standing at a coin or an NPC before walking back, ms. */
  awayWaitMs: 1200,
  /** Chance per NPC served that it calls him out from behind the counter (SPEC §6.7). */
  npcCallChance: 0.2,
  /** A player may BROWSE a stall within this distance of its customer line, tiles. */
  browseReach: 1.2,
  /** Close enough to a walk target to count as there, tiles. */
  arrive: 0.05,
} as const;
