// Enemies (SPEC §9, §9.1 starting stats). Speeds in tiles/s: the Grunt's 1.0 is 1.3 tiles/s and the
// others scale from it. HP, damage and budget cost are §9.1's; reaches, cooldowns and wind-ups (the
// tells, §9.6) are starting values for playtesting. The Colossus (§9.2) is a boss module (FF11): its
// attacks, stagger and final phase run in src/host/sim/boss/colossus.ts from the params here.
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
  // Snares slow it at half strength (§7.1, FF8: `slowResist` in the effect pipeline).
  slowResist: 0.5,
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

/**
 * The Colossus (§9.2, FF11): a slow walker on the breaker field. `attack` is its slam (a 1.5 s red
 * circle in front of it, players and structures); walls take 3× (wall breaker), the Citadel 1.5×.
 * HP is Mk I's at 2 players on Normal: Mk II and III multiply it (`hpMk2`, `hpMk3`), then player
 * count and difficulty. Times in ms, distances in tiles, `stagger*` as fractions of the meter.
 */
export const colossus = {
  id: 'colossus',
  hp: 2500,
  speed: 0.45 * SPEED,
  radius: 0.9,
  flying: false,
  budget: 10,
  ai: 'boss',
  field: 'breaker',
  attack: {
    shape: 'circle',
    damage: 60,
    range: 1.2,
    cooldownMs: 2500,
    windupMs: 1500,
    radius: 1.5,
    hitsFlyers: false,
  },
  vsStructure: { wall: 3, base: 1.5 },
  slowResist: 0.5,
  boss: {
    module: 'colossus',
    params: {
      hpMk2: 1.6,
      hpMk3: 2.4,
      // The slam's circle sits this far past its body; it slams a player or soldier within reach.
      slamOffset: 0.7,
      // Boulder throw (Mk II+): wind-up, then a lob at a tower or the largest group of players.
      boulderWindupMs: 1000,
      boulderCooldownMs: 7000,
      boulderMinRange: 2.5,
      boulderRange: 9,
      boulderRadius: 1.2,
      boulderDamage: 45,
      boulderSpeed: 8,
      groupRadius: 2,
      // Final phase (Mk III below `finalAt` of its HP): faster moves and attacks, shockwave rings,
      // Runner calls from the spires.
      finalAt: 0.5,
      finalSpeed: 1.35,
      finalCooldown: 0.6,
      ringCount: 5,
      ringBand: 0.8,
      ringStepMs: 130,
      ringDamage: 25,
      callWindupMs: 1000,
      callCooldownMs: 10_000,
      runners: 5,
      // Stagger: damage fills `staggerPerHp` meters per max HP; a counted stun adds `staggerStun`,
      // at most one per `stunLockMs`; full = `staggerMs` on one knee taking +`staggerBonus` damage.
      staggerPerHp: 3,
      staggerStun: 0.25,
      stunLockMs: 2500,
      staggerMs: 3000,
      staggerBonus: 0.5,
      // Grunt and Swarm escorts walk in with Mk II and III (§9.2 wave 10).
      escortGrunts: 2,
      escortSwarms: 1,
    },
  },
} satisfies EnemyDef;

export const enemies: EnemyDef[] = [grunt, runner, swarm, brute, flyer, siege, hunter, colossus];
