// The Citadel (SPEC §3.3–§3.5) and the run's rules and timings (§4–§6, §10, §11).
// Starting values for playtesting (§14).
import type { BaseDef, RulesDef } from './types';

export const base = {
  hp: 1000,
  repairPerCrate: 100,
  stages: [0.66, 0.33, 0.1],
  alarmAt: 0.25,
  archers: {
    count: 2,
    // On the walls either side of the gate; the third (shop) sits on the keep.
    at: [
      { x: 16.6, y: 1.2 },
      { x: 19.4, y: 1.2 },
      { x: 18, y: 0.8 },
    ],
    attack: {
      shape: 'projectile',
      damage: 12,
      range: 7,
      cooldownMs: 1100,
      speed: 26,
      hitsFlyers: true,
    },
  },
} satisfies BaseDef;

export const rules = {
  startCoins: 6,
  countdownMs: 3000,
  buildCapMs: 45_000,
  respawnMs: 10_000,
  victoryMs: 5000,
  defeatMs: 4000,
  spawnWarningMs: 3000,
  inputStaleMs: 250,
  dropLockMs: 1000,
  pickupRadius: 0.9,
  giveRadius: 2.5,
  // In front of the gate, below the repair zone.
  respawn: [
    { x: 17.2, y: 3.5 },
    { x: 18.8, y: 3.5 },
    { x: 16, y: 3.5 },
    { x: 20, y: 3.5 },
    { x: 14.8, y: 3.5 },
    { x: 21.2, y: 3.5 },
  ],
  statCaps: {
    range: { pctMax: 0.4 },
    moveSpeed: { pctMax: 0.4 },
    damageReduction: { addMax: 0.4 },
  },
  breakerWallCost: 3,
  separation: 0.3,
  knockbackDecay: 0.85,
} satisfies RulesDef;
