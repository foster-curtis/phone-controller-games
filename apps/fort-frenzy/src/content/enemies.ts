// Enemies (SPEC §9, §9.1 starting stats). Speeds in tiles/s: the Grunt's 1.0 is 1.3 tiles/s and the
// others scale from it. HP, damage and budget cost are §9.1's; reaches, cooldowns and wind-ups (the
// tells, §9.6) are starting values for playtesting. The Colossus (§9.2) arrives with FF11.
import type { EnemyDef } from './types';

/** Tiles/s of speed 1.0 (§9.1's relative speeds). */
const SPEED = 1.3;

export const grunt = {
  id: 'grunt',
  hp: 100,
  speed: 1.3,
  radius: 0.32,
  flying: false,
  budget: 1,
  ai: 'path',
  field: 'ground',
  attack: {
    shape: 'arc',
    damage: 10,
    range: 0.45,
    cooldownMs: 1000,
    windupMs: 250,
    arcDeg: 90,
    hitsFlyers: false,
  },
  aggro: { radius: 2.5, leash: 5 },
} satisfies EnemyDef;

/** Skitter: fast and fragile, ignores players, one 40 burst on the base, then gone. */
export const runner = {
  id: 'runner',
  hp: 40,
  speed: 2 * SPEED,
  radius: 0.28,
  flying: false,
  budget: 1,
  ai: 'runner',
  field: 'ground',
  attack: { shape: 'circle', damage: 40, range: 0.15, cooldownMs: 0, hitsFlyers: false },
} satisfies EnemyDef;

/** Scrap mites: packs of 8 weak biters (budget 3 per pack, coins on the last one). */
export const swarm = {
  id: 'swarm',
  hp: 25,
  speed: 1.2 * SPEED,
  radius: 0.15,
  flying: false,
  budget: 3,
  groupSize: 8,
  ai: 'swarm',
  field: 'ground',
  attack: {
    shape: 'arc',
    damage: 4,
    range: 0.3,
    cooldownMs: 800,
    windupMs: 150,
    arcDeg: 90,
    hitsFlyers: false,
  },
  aggro: { radius: 2.2, leash: 4.5 },
} satisfies EnemyDef;

/** Brute: huge HP, smashes walls (2×) on the breaker field; a long wind-up is its tell. */
export const brute = {
  id: 'brute',
  hp: 600,
  speed: 0.6 * SPEED,
  radius: 0.5,
  flying: false,
  budget: 5,
  ai: 'brute',
  field: 'breaker',
  attack: {
    shape: 'arc',
    damage: 40,
    range: 0.55,
    cooldownMs: 1800,
    windupMs: 700,
    arcDeg: 100,
    hitsFlyers: false,
  },
  vsStructure: { wall: 2 },
  aggro: { radius: 2.5, leash: 4 },
} satisfies EnemyDef;

/** Wasp drone: flies over walls and shoots its stinger (render's wasp-shot speed, 16 tiles/s). */
export const flyer = {
  id: 'flyer',
  hp: 80,
  speed: 1.2 * SPEED,
  radius: 0.3,
  flying: true,
  budget: 2,
  ai: 'flyer',
  field: 'none',
  attack: {
    shape: 'projectile',
    damage: 12,
    range: 3.5,
    cooldownMs: 1400,
    windupMs: 300,
    speed: 16,
    hitsFlyers: false,
  },
  aggro: { radius: 3, leash: 6 },
} satisfies EnemyDef;

/** Bombard: stops at range (under the Engineer's 9) and shells the base or towers. */
export const siege = {
  id: 'siege',
  hp: 150,
  speed: 0.8 * SPEED,
  radius: 0.5,
  flying: false,
  budget: 4,
  ai: 'siege',
  field: 'ground',
  attack: {
    shape: 'circle',
    damage: 25,
    range: 7.5,
    cooldownMs: 3500,
    windupMs: 700,
    radius: 0.8,
    hitsFlyers: false,
  },
} satisfies EnemyDef;

/** Stalker: hunts players (crouch, then lunge). */
export const hunter = {
  id: 'hunter',
  hp: 200,
  speed: 1.3 * SPEED,
  radius: 0.36,
  flying: false,
  budget: 3,
  ai: 'hunter',
  field: 'ground',
  attack: {
    shape: 'arc',
    damage: 15,
    range: 0.5,
    cooldownMs: 1100,
    windupMs: 400,
    arcDeg: 90,
    hitsFlyers: false,
  },
} satisfies EnemyDef;

export const enemies: EnemyDef[] = [grunt, runner, swarm, brute, flyer, siege, hunter];
