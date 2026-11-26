// Match pacing build values (SPEC §6.14, §6.15): how long the TV holds each beat outside the round
// sim. The §7 values (round length, opening, rounds) stay in `src/content/balance.ts`; these live here
// because `balance.ts` isn't TF10's file (BUILD_PLAN §8). Move them into `balance.match` when its owner
// next edits it. Times in host ms.
export const MATCH_TUNING = {
  /** "HANDS UP!" freeze before the first reveal card (SPEC §6.14). */
  handsUpMs: 2500,
  /** Each reveal card's time on screen before the next opens. */
  revealCardMs: 3000,
  /** The crown and confetti beat after the last card. */
  revealCrownMs: 4000,
  /** Guard rush and fade to black (SPEC §6.14 round transition). */
  transitionMs: 5000,
  /** Each podium reveal step: 4th+ row, 3rd, 2nd, then 1st (SPEC §6.15). */
  podiumStepMs: 2500,
  /** How to play cards when the game passes no count (SPEC §6.19 outline). */
  rulesCards: 7,
} as const;
export type MatchTuning = typeof MATCH_TUNING;
