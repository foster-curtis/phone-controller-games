// Difficulty (SPEC §2.2) and player-count scaling (§9.4). Starting values, set in playtesting.
import type { DifficultyDef, ScalingDef } from './types';

export const difficulties: DifficultyDef[] = [
  { id: 'easy', budget: 0.75, enemyHp: 0.8, enemyDamage: 0.75, baseHp: 1.25, coinIncome: 1.25 },
  { id: 'normal', budget: 1, enemyHp: 1, enemyDamage: 1, baseHp: 1, coinIncome: 1 },
  { id: 'hard', budget: 1.25, enemyHp: 1.2, enemyDamage: 1.25, baseHp: 0.85, coinIncome: 0.9 },
];

/** `0.5 + 0.25 × players`: 1.0× with 2 players, 1.5× with 4, 2.0× with 6 (§9.4). */
export const scaling = { base: 0.5, perPlayer: 0.25 } satisfies ScalingDef;
