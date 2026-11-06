// Balance sheet (SPEC §15.4): every number that tunes Fort Frenzy lives in this one file. The
// Citadel and run rules, difficulty and player scaling, the four classes, structures, enemies and the
// Colossus, waves, upgrade cards and the team shop, typed with `satisfies` against ./types. Units:
// distances in tiles, speeds in tiles/s, times in ms (the sim converts them to steps at load), damage
// and HP as plain numbers, `*Pct` and multipliers as fractions. The sim keeps no tuning numbers of its
// own: card, passive and boss modules read every param from here (a missing one throws, and
// content.test builds them all). Every value is a starting value for playtesting (§14 #2). The map's
// layout is ./map.ts.
import type { LaneId } from '../shared/ids';
import type {
  BaseDef,
  CardDef,
  CharacterDef,
  DifficultyDef,
  EnemyDef,
  RulesDef,
  ScalingDef,
  ShopItemDef,
  StatMod,
  StructureDef,
  WaveDef,
} from './types';

// ==== Citadel and run rules ======================================================================
// The Citadel (SPEC §3.3–§3.5) and the run's rules and timings (§4–§6, §10, §11).
// Starting values for playtesting (§14).

export const base = {
  hp: 1000,
  repairPerCrate: 25,
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
    // Quick Recovery: −2 s a stack, never below 5 s of the 10 s respawn (§6.1).
    respawnMs: { addMin: -5000 },
    // Deadeye's shorter Steady Aim wait never drops below a fifth of it.
    durationMs: { pctMin: -0.8 },
  },
  breakerWallCost: 3,
  separation: 0.3,
  knockbackDecay: 0.85,
  projectileRadius: 0.12,
  enemySwingSlack: 0.25,
  enemyShotSlack: 1,
  fortifyReach: 0.75,
  // About 15% of offers include one rare (§6.1); a boss wave guarantees one.
  cardOffer: { size: 3, rareChance: 0.15 },
  // Fire Arrows' burn ticks every 0.5 s, Venom Bolts' poison every second (§6.1).
  dots: {
    burn: { maxStacks: 3, tickEveryMs: 500 },
    poison: { maxStacks: 5, tickEveryMs: 1000 },
  },
  comboSpread: { radius: 1.6, durationMs: 3000 },
} satisfies RulesDef;

// ==== Difficulty and player scaling ==============================================================
// Difficulty (SPEC §2.2) and player-count scaling (§9.4). Starting values, set in playtesting.

export const difficulties: DifficultyDef[] = [
  { id: 'easy', budget: 0.75, enemyHp: 0.8, enemyDamage: 0.75, baseHp: 1.25, coinIncome: 1.25 },
  { id: 'normal', budget: 1, enemyHp: 1, enemyDamage: 1, baseHp: 1, coinIncome: 1 },
  { id: 'hard', budget: 1.25, enemyHp: 1.2, enemyDamage: 1.25, baseHp: 0.85, coinIncome: 0.9 },
];

/** `0.5 + 0.25 × players`: 1.0× with 2 players, 1.5× with 4, 2.0× with 6 (§9.4). */
export const scaling = { base: 0.5, perPlayer: 0.25 } satisfies ScalingDef;

// ==== Characters (knights) =======================================================================
// Characters (SPEC §8, §10.1 input table, §6 carry). Starting values for playtesting (§14).
// FF6: the Engineer; FF9: the Quartermaster and Commander; FF8: the Warden.

export const engineer = {
  id: 'engineer',
  hp: 100,
  moveSpeed: 4.5,
  radius: 0.32,
  // Longbow: the longest range in the game (§8). Bolts fly at render PROJECTILE_SPEEDS.bolt (26 t/s,
  // FF3-fix-1; BUILD_PLAN §8 FF7).
  main: {
    shape: 'projectile',
    damage: 34,
    range: 9,
    cooldownMs: 600,
    speed: 26,
    hitsFlyers: true,
  },
  // A wide circle around the Engineer: light area damage and knockback (§8). Radius 3 → 3.5 (C3).
  super: {
    shape: 'circle',
    damage: 25,
    range: 0,
    radius: 3.5,
    cooldownMs: 500,
    knockback: 2.5,
    hitsFlyers: true,
  },
  input: { main: 'aimed', super: 'tap' },
  /** Super charge per point of damage dealt (200 damage fills it). */
  superChargeRate: 0.005,
  passive: { module: 'steady_aim', params: { stillMs: 600, damagePct: 0.25, rangePct: 0.2 } },
  // Arc order left, up, right.
  build: ['arrow_tower', 'bomb_tower'],
  carryCap: 4,
  // Faster than linear (§6): one crate is barely noticeable, a full load is a real slowdown.
  carrySlowdown: [0, 0.04, 0.1, 0.2, 0.32],
} satisfies CharacterDef;

// Quartermaster (support, §6, §8): neon knights' Artificer.
export const quartermaster = {
  id: 'quartermaster',
  hp: 90,
  moveSpeed: 4.6,
  radius: 0.32,
  // 3–4 nanite bolts in a narrow cone, medium-long range; walls and towers block them (§8). Bolts fly
  // at render PROJECTILE_SPEEDS['nanite-bolt'] (20 t/s, FF3-fix-1).
  main: {
    shape: 'projectile',
    damage: 9,
    range: 6.5,
    cooldownMs: 700,
    count: 4,
    spreadDeg: 16,
    speed: 20,
    hitsFlyers: true,
    blockedBy: ['wall', 'tower'],
  },
  // A very wide, long cone through walls and towers: heals the players it hits and gives the towers
  // it hits a temporary defense bonus (`effects`: damage reduction); it hurts no one (§8).
  super: {
    shape: 'cone',
    damage: 0,
    range: 8,
    arcDeg: 110,
    cooldownMs: 500,
    hitsFlyers: true,
    heal: 40,
    effects: [{ effect: 'tower_defense', strength: 0.3, durationMs: 6000 }],
  },
  input: { main: 'aimed', super: 'aimed' },
  superChargeRate: 0.006,
  // Field Medic heals nearby players every second in combat; its healing charges the super at
  // `chargeRate` per HP healed, slower than damage does (§8).
  passive: {
    module: 'field_medic',
    params: { radius: 2.5, heal: 3, everyMs: 1000, chargeRate: 0.002 },
  },
  build: [],
  // Carries 8 with no slowdown (§6).
  carryCap: 8,
  carrySlowdown: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  supply: {
    crateDiscount: 0.5,
    throwRange: 8,
    throwSpeed: 12,
    kitRepair: 250,
    throwMinFlightMs: 250,
  },
} satisfies CharacterDef;

// Commander (squad leader, §8).
export const commander = {
  id: 'commander',
  hp: 130,
  moveSpeed: 4.3,
  radius: 0.34,
  // Sword slash in a short arc in front of him; aimed, a quick tap auto-aims (FF7-fix-3, C3).
  main: {
    shape: 'arc',
    damage: 28,
    range: 1.4,
    arcDeg: 110,
    cooldownMs: 550,
    hitsFlyers: false,
  },
  // Morale: his squad and he get attack speed and damage (`effects`); he also moves faster
  // (`selfEffects`). The aura fades as it runs out (§2.4).
  super: {
    shape: 'buff',
    damage: 0,
    range: 0,
    cooldownMs: 500,
    hitsFlyers: false,
    effects: [{ effect: 'morale', strength: 0.35, durationMs: 6000 }],
    selfEffects: [{ effect: 'haste', strength: 0.25, durationMs: 6000 }],
  },
  input: { main: 'aimed', super: 'tap' },
  superChargeRate: 0.008,
  // Lead from the Front: his soldiers within `radius` deal +`damagePct` (a refreshed aura).
  passive: {
    module: 'lead_from_the_front',
    params: { radius: 3, damagePct: 0.25, auraMs: 200 },
  },
  // The rally flag is free and isn't a structure (§6, action button row 7).
  build: [],
  carryCap: 4,
  carrySlowdown: [0, 0.04, 0.1, 0.2, 0.32],
  // 3 soldiers, 4 after the wave 5 boss, 5 after the wave 10 boss (boss waves come from wave data).
  squad: {
    size: [3, 4, 5],
    soldier: {
      hp: 60,
      moveSpeed: 4.4,
      radius: 0.24,
      attack: { shape: 'arc', damage: 8, range: 0.5, cooldownMs: 900, hitsFlyers: false },
    },
    followRadius: 1.3,
    aggro: { radius: 3, leash: 5 },
    hurry: { at: 3, factor: 1.3 },
    formation: { flagRing: 0.8, followSpread: 0.6 },
  },
} satisfies CharacterDef;

/**
 * Warden (tank, §8): an aimed ground slam in a short arc (a quick tap auto-aims; FF7-fix-3, C3), a
 * longer aimed stomp whose arc stuns, and Mason (walls near him repair, combat only). Both attacks wind up, so the
 * hammer and the foot land on the TV when the damage does (`windupMs` = the clips' impact times,
 * render/clips/warden.ts; src/host/__tests__/speeds.test.ts keeps them equal).
 */
export const warden = {
  id: 'warden',
  hp: 170,
  moveSpeed: 3.8,
  radius: 0.36,
  // C3: both arcs ~15% narrower and ~15% longer (slam 1.5 → 1.75 tiles, 120° → 102°; stomp 3.2 → 3.7,
  // 100° → 85°).
  main: {
    shape: 'arc',
    damage: 30,
    range: 1.75,
    arcDeg: 102,
    cooldownMs: 800,
    windupMs: 200,
    knockback: 0.5,
    hitsFlyers: false,
  },
  super: {
    shape: 'arc',
    damage: 45,
    range: 3.7,
    arcDeg: 85,
    cooldownMs: 600,
    windupMs: 320,
    hitsFlyers: false,
    effects: [{ effect: 'stun', strength: 1, durationMs: 1400 }],
  },
  input: { main: 'aimed', super: 'aimed' },
  /** 160 damage fills it: the slam hits groups, so the stomp comes round often. */
  superChargeRate: 0.00625,
  passive: { module: 'mason', params: { radius: 2.5, hpPerSec: 10 } },
  // Arc order left, up, right.
  build: ['wall', 'snare', 'fortify'],
  carryCap: 4,
  carrySlowdown: [0, 0.03, 0.08, 0.16, 0.26],
} satisfies CharacterDef;

export const characters: CharacterDef[] = [engineer, quartermaster, commander, warden];

// ==== Structures =================================================================================
// Structures (SPEC §7, §8 build kits). 1×1 tiles; walls and towers share a high path cost (§15.5).
// FF6: the arrow tower (neon knights: pulse turret); FF8: the bomb tower (mortar), walls, snares
// (shock nets) and Fortify.

export const arrowTower = {
  id: 'arrow_tower',
  cost: 2,
  hp: 250,
  pathCost: 30,
  blocksProjectiles: true,
  // Long range, single target, hits Flyers (§8).
  attack: {
    shape: 'projectile',
    damage: 14,
    range: 6,
    cooldownMs: 700,
    speed: 26,
    hitsFlyers: true,
  },
} satisfies StructureDef;

/**
 * Bomb tower (neon knights: mortar tower, §8): short range, area damage. Lobs an arcing shell at the
 * nearest ground enemy's position; it bursts on landing and damages everything in `radius`. `speed`
 * is the shell's ground speed (tiles/s); a short lob still takes the minimum flight time
 * (sim/structures/mortar.ts).
 */
export const bombTower = {
  id: 'bomb_tower',
  cost: 3,
  hp: 220,
  pathCost: 30,
  blocksProjectiles: true,
  attack: {
    shape: 'projectile',
    damage: 32,
    range: 4.5,
    cooldownMs: 2000,
    speed: 6,
    radius: 1.3,
    minFlightMs: 700,
    hitsFlyers: false,
  },
} satisfies StructureDef;

/** Wall (§7): reroutes enemies (high path cost); Brutes and the Colossus smash through (§15.5). */
export const wall = {
  id: 'wall',
  cost: 1,
  hp: 300,
  pathCost: 30,
  blocksProjectiles: true,
} satisfies StructureDef;

/**
 * Snare (neon knights: shock net, §7.1): no HP, costs the same as an open tile to path through, 5
 * discharges that each slow every ground enemy on the tile by 40% for 2 s, rearming after 0.5 s.
 */
export const snare = {
  id: 'snare',
  cost: 1,
  hp: null,
  pathCost: 1,
  blocksProjectiles: false,
  discharges: 5,
  rearmMs: 500,
  slow: { effect: 'slow', strength: 0.4, durationMs: 2000 },
  // The inner half of an enemy's body must be on the net.
  triggerFraction: 0.5,
} satisfies StructureDef;

/** Fortify (§8): attaches to a tower (a flag on it, not a tile of its own) for a defense bonus. */
export const fortify = {
  id: 'fortify',
  cost: 2,
  hp: null,
  pathCost: 1,
  blocksProjectiles: false,
  attachesTo: ['arrow_tower', 'bomb_tower'],
  defense: 0.35,
} satisfies StructureDef;

export const structures: StructureDef[] = [arrowTower, bombTower, wall, snare, fortify];

// ==== Enemies and the Colossus ===================================================================
// Enemies (SPEC §9, §9.1 starting stats). Speeds in tiles/s: the Grunt's 1.0 is 1.3 tiles/s and the
// others scale from it. HP, damage and budget cost are §9.1's; reaches, cooldowns and wind-ups (the
// tells, §9.6) are starting values for playtesting. The Colossus (§9.2) is a boss module (FF11): its
// attacks, stagger and final phase run in src/host/sim/boss/colossus.ts from the params here.
// `radius` is the feet (walking, collisions, enemy reach); `body` is what our attacks hit (C4): the
// drawn torso, head and legs measured off each rig at rest, in tiles of drawn height (80 sprite units).

/** Tiles/s of speed 1.0 (§9.1's relative speeds). */
const SPEED = 1.3;

export const grunt = {
  id: 'grunt',
  hp: 100,
  speed: 1.3,
  radius: 0.32,
  flying: false,
  // Drone: torso, head and legs, out to its head (the blade arm reaching past it, the back claw and
  // the spine spikes left out).
  body: { radius: 0.42, bottom: 0, top: 1.01 },
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
  // Body, core and legs.
  body: { radius: 0.44, bottom: 0, top: 0.57 },
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
  // A mite at size 1 (packs draw them 0.8–1.2×).
  body: { radius: 0.16, bottom: 0, top: 0.19 },
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
  // A sideways drift and a pace re-rolled every 12–40 steps, with short stops (6–14 steps).
  jitter: {
    drift: 0.65,
    pace: 0.8,
    paceRange: 0.45,
    stopChance: 0.12,
    rollMs: [200, 667],
    stopMs: [100, 233],
  },
} satisfies EnemyDef;

/** Brute: huge HP, smashes walls (2×) on the breaker field; a long wind-up is its tell. */
export const brute = {
  id: 'brute',
  hp: 600,
  speed: 0.6 * SPEED,
  radius: 0.5,
  flying: false,
  // Torso, sunk head and legs (arms, fists and shoulder plates left out).
  body: { radius: 0.54, bottom: 0, top: 1.5 },
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
  // Hull and head (rotors, masts and the thruster glow left out) at its flight height: the hull's
  // underside flies 1.37 tiles over its shadow (C4: half of FF10's 2.74; render/clips/wasp.ts).
  body: { radius: 0.43, bottom: 1.37, top: 1.76 },
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
  // Hull, dome and shell rack (the barrel and splayed legs left out).
  body: { radius: 0.56, bottom: 0, top: 1.18 },
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
    // The shell's ground speed and its shortest flight.
    speed: 6,
    minFlightMs: 600,
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
  // Chest, head and legs (the tail left out).
  body: { radius: 0.54, bottom: 0, top: 0.8 },
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
  // Paths round tower and sentry range (+4 per covering attacker) and retargets on a player 2 tiles
  // closer (C3, FF10-fix-1).
  hunt: { closeRange: 1.5, retargetTiles: 2, threatCost: 4, threatPad: 1 },
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
  // Kept low on purpose (C4): its legs, a bit bigger than its 0.9 feet; hip, core and head stay out.
  body: { radius: 1, bottom: 0, top: 0.8 },
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
      // The slam's circle sits this far past its body; it slams a player or soldier within
      // `slamOffset` + `slamReach` × the slam radius, and the Citadel within `slamOffset` + `baseReach`.
      slamOffset: 0.7,
      slamReach: 0.6,
      baseReach: 0.3,
      // Boulder throw (Mk II+): wind-up, then a lob at a tower or the largest group of players.
      boulderWindupMs: 1000,
      boulderMinFlightMs: 600,
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

// ==== Waves ======================================================================================
// Wave data (SPEC §9.3, §9.4): budget, allowed types, open lanes, guaranteed spawns. Budgets are for
// 2 players at Normal; player-count scaling and difficulty multiply them at wave start. Each wave
// guarantees the type it introduces; every pool holds the Grunt (cost 1), so the generator spends to
// within 1 of the budget. Lanes: bottom from wave 1, left from 3, right from 8 (§9.4). Waves 5, 10
// and 15 carry the Colossus (`boss`); until FF11 the boss doesn't spawn and those waves end with
// their escorts (§9.2: a light Grunt stream; Grunts and Swarms; final-phase Runners).
// Starting values for playtesting (§14): about 16 minutes of combat over 15 waves.

const ONE: LaneId[] = ['bottom'];
const TWO: LaneId[] = ['bottom', 'left'];
const THREE: LaneId[] = ['bottom', 'left', 'right'];

export const waves: WaveDef[] = [
  {
    n: 1,
    budget: 8,
    allowed: ['grunt'],
    lanes: ONE,
    guaranteed: [{ enemy: 'grunt', count: 1 }],
    durationMs: 30_000,
  },
  {
    n: 2,
    budget: 12,
    allowed: ['grunt', 'runner'],
    lanes: ONE,
    guaranteed: [{ enemy: 'runner', count: 2 }],
    durationMs: 40_000,
  },
  {
    n: 3,
    budget: 16,
    allowed: ['grunt', 'runner', 'swarm'],
    lanes: TWO,
    guaranteed: [{ enemy: 'swarm', count: 1, lane: 'left' }],
    durationMs: 45_000,
  },
  {
    n: 4,
    budget: 22,
    allowed: ['grunt', 'runner', 'swarm', 'brute'],
    lanes: TWO,
    guaranteed: [{ enemy: 'brute', count: 1 }],
    durationMs: 50_000,
  },
  {
    n: 5,
    budget: 12,
    allowed: ['grunt'],
    lanes: TWO,
    guaranteed: [],
    durationMs: 60_000,
    boss: { id: 'colossus', mk: 1 },
  },
  {
    n: 6,
    budget: 26,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer'],
    lanes: TWO,
    guaranteed: [{ enemy: 'flyer', count: 2 }],
    durationMs: 55_000,
  },
  {
    n: 7,
    budget: 30,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege'],
    lanes: TWO,
    guaranteed: [{ enemy: 'siege', count: 1 }],
    durationMs: 60_000,
  },
  {
    n: 8,
    budget: 34,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    lanes: THREE,
    guaranteed: [{ enemy: 'hunter', count: 2, lane: 'right' }],
    durationMs: 65_000,
  },
  {
    n: 9,
    budget: 40,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    lanes: THREE,
    guaranteed: [],
    durationMs: 70_000,
  },
  {
    n: 10,
    budget: 28,
    allowed: ['grunt', 'swarm'],
    lanes: THREE,
    guaranteed: [],
    durationMs: 75_000,
    boss: { id: 'colossus', mk: 2 },
  },
  {
    n: 11,
    budget: 46,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    lanes: THREE,
    guaranteed: [],
    durationMs: 75_000,
  },
  {
    n: 12,
    budget: 58,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    lanes: THREE,
    guaranteed: [
      { enemy: 'brute', count: 2 },
      { enemy: 'siege', count: 1 },
    ],
    durationMs: 80_000,
  },
  {
    n: 13,
    budget: 54,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    lanes: THREE,
    guaranteed: [],
    durationMs: 80_000,
  },
  {
    n: 14,
    budget: 68,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    lanes: THREE,
    guaranteed: [
      { enemy: 'brute', count: 2 },
      { enemy: 'hunter', count: 2 },
      { enemy: 'siege', count: 1 },
    ],
    durationMs: 85_000,
  },
  {
    n: 15,
    budget: 34,
    allowed: ['grunt', 'runner', 'swarm'],
    lanes: THREE,
    guaranteed: [{ enemy: 'runner', count: 4 }],
    durationMs: 90_000,
    boss: { id: 'colossus', mk: 3 },
  },
];

// ==== Upgrade cards ==============================================================================
// Upgrade cards (SPEC §6.1): the 8 shared commons (numbers tuned per class, `perClass`), then each
// class's 2 commons, 5 rares and 1 combo, in the spec's table order. Stat cards change stats (attack
// stats scoped to their button, so aim previews read the effective values); the rest are sim
// modules (src/host/sim/cards/). Every number is a starting value for playtesting (§14 #2).
// Stacks add (×N); range, movement speed and damage reduction are capped by the rules (+40%).

const per = (
  stat: StatMod['stat'],
  key: 'addPct' | 'add',
  engineer: number,
  warden: number,
  quartermaster: number,
  commander: number,
): CardDef['perClass'] => {
  const mod = (v: number): StatMod[] => [key === 'add' ? { stat, add: v } : { stat, addPct: v }];
  return {
    engineer: mod(engineer),
    warden: mod(warden),
    quartermaster: mod(quartermaster),
    commander: mod(commander),
  };
};

// ---- shared commons -----------------------------------------------------------------------------

export const commonCards: CardDef[] = [
  {
    id: 'vitality',
    owner: 'common',
    tier: 'common',
    perClass: per('maxHp', 'addPct', 0.12, 0.1, 0.12, 0.1),
  },
  {
    id: 'might',
    owner: 'common',
    tier: 'common',
    perClass: per('damage', 'addPct', 0.1, 0.1, 0.12, 0.1),
  },
  {
    id: 'haste',
    owner: 'common',
    tier: 'common',
    perClass: per('attackSpeed', 'addPct', 0.1, 0.1, 0.1, 0.12),
  },
  {
    id: 'reach',
    owner: 'common',
    tier: 'common',
    perClass: per('range', 'addPct', 0.08, 0.1, 0.1, 0.12),
  },
  {
    id: 'swiftness',
    owner: 'common',
    tier: 'common',
    perClass: per('moveSpeed', 'addPct', 0.08, 0.1, 0.08, 0.08),
  },
  {
    id: 'focus',
    owner: 'common',
    tier: 'common',
    perClass: per('superCharge', 'addPct', 0.12, 0.12, 0.15, 0.12),
  },
  {
    id: 'toughness',
    owner: 'common',
    tier: 'common',
    perClass: per('damageReduction', 'add', 0.06, 0.08, 0.06, 0.07),
  },
  // −2 s respawn, never below 5 s (the rules cap Σ add at −5000 ms on a 10 s respawn).
  {
    id: 'quick_recovery',
    owner: 'common',
    tier: 'common',
    perClass: per('respawnMs', 'add', -2000, -2000, -2000, -2000),
  },
];

// ---- engineer -----------------------------------------------------------------------------------

export const engineerCards: CardDef[] = [
  {
    id: 'quick_draw',
    owner: 'engineer',
    tier: 'common',
    stats: [{ stat: 'projectileSpeed', addPct: 0.25, scope: 'main' }],
  },
  {
    id: 'blast_radius',
    owner: 'engineer',
    tier: 'common',
    stats: [{ stat: 'radius', addPct: 0.2, scope: 'super' }],
  },
  {
    id: 'fire_arrows',
    owner: 'engineer',
    tier: 'rare',
    module: { module: 'fire_arrows', params: { tick: 3, durationMs: 3000 } },
  },
  {
    id: 'piercing_shot',
    owner: 'engineer',
    tier: 'rare',
    module: { module: 'piercing_shot', params: { pierce: 1 } },
  },
  {
    id: 'skyhunter',
    owner: 'engineer',
    tier: 'rare',
    favoredEnemy: 'flyer',
    module: { module: 'skyhunter', params: { enemies: 'flyer', pct: 0.5 } },
  },
  // Steady Aim's activation time is its passive's duration (600 ms → 360 ms).
  {
    id: 'deadeye',
    owner: 'engineer',
    tier: 'rare',
    stats: [{ stat: 'durationMs', addPct: -0.4, scope: 'passive' }],
  },
  {
    id: 'volley',
    owner: 'engineer',
    tier: 'rare',
    module: { module: 'volley', params: { every: 4, minEvery: 2, arrows: 3, spreadDeg: 14 } },
  },
  {
    id: 'wildfire',
    owner: 'engineer',
    tier: 'combo',
    requires: ['fire_arrows', 'piercing_shot'],
    module: { module: 'wildfire' },
  },
];

// ---- warden -------------------------------------------------------------------------------------

export const wardenCards: CardDef[] = [
  {
    id: 'heavy_slam',
    owner: 'warden',
    tier: 'common',
    stats: [{ stat: 'arcDeg', addPct: 0.2, scope: 'main' }],
  },
  // Longer stomp stun (the stun's duration × `stunMs`); no extra stagger on the boss (FF11).
  {
    id: 'earthshaker',
    owner: 'warden',
    tier: 'common',
    stats: [{ stat: 'stunMs', addPct: 0.3, scope: 'super' }],
  },
  {
    id: 'aftershock',
    owner: 'warden',
    tier: 'rare',
    module: {
      module: 'aftershock',
      // The zone drops `reachPct` of the slam's reach ahead; stacked slows cap at `maxSlow`.
      params: { radius: 1.2, slow: 0.35, maxSlow: 0.9, slowMs: 800, zoneMs: 2000, reachPct: 0.6 },
    },
  },
  {
    id: 'giant_slayer',
    owner: 'warden',
    tier: 'rare',
    favoredEnemy: 'brute',
    module: { module: 'giant_slayer', params: { enemies: 'brute,colossus', pct: 0.5 } },
  },
  {
    id: 'master_mason',
    owner: 'warden',
    tier: 'rare',
    stats: [
      { stat: 'repairRate', addPct: 0.5, scope: 'passive' },
      { stat: 'auraRadius', addPct: 0.3, scope: 'passive' },
    ],
  },
  {
    id: 'bodyguard',
    owner: 'warden',
    tier: 'rare',
    module: { module: 'bodyguard', params: { radius: 3, reduction: 0.2, auraMs: 200 } },
  },
  {
    id: 'unshakable',
    owner: 'warden',
    tier: 'rare',
    unique: true,
    module: { module: 'unshakable' },
  },
  {
    id: 'fault_line',
    owner: 'warden',
    tier: 'combo',
    requires: ['aftershock', 'master_mason'],
    // `touch`: how close to a wall (tiles past an enemy's body) the shock reaches.
    module: { module: 'fault_line', params: { slow: 0.4, slowMs: 1500, touch: 0.15 } },
  },
];

// ---- quartermaster ------------------------------------------------------------------------------

export const quartermasterCards: CardDef[] = [
  {
    id: 'light_load',
    owner: 'quartermaster',
    tier: 'common',
    unique: true,
    module: { module: 'light_load', params: { factor: 0.5, auraMs: 200 } },
  },
  {
    id: 'strong_arm',
    owner: 'quartermaster',
    tier: 'common',
    stats: [
      { stat: 'throwRange', addPct: 0.3 },
      { stat: 'throwSpeed', addPct: 0.3 },
    ],
  },
  {
    id: 'venom_bolts',
    owner: 'quartermaster',
    tier: 'rare',
    module: { module: 'venom_bolts', params: { tick: 2, durationMs: 4000 } },
  },
  {
    id: 'overflow',
    owner: 'quartermaster',
    tier: 'rare',
    unique: true,
    module: { module: 'overflow', params: { cap: 40, durationMs: 6000 } },
  },
  {
    id: 'bulk_buyer',
    owner: 'quartermaster',
    tier: 'rare',
    module: { module: 'bulk_buyer', params: { every: 3, minEvery: 2 } },
  },
  {
    id: 'wide_aura',
    owner: 'quartermaster',
    tier: 'rare',
    stats: [{ stat: 'auraRadius', addPct: 0.3 }],
  },
  {
    id: 'triage',
    owner: 'quartermaster',
    tier: 'rare',
    unique: true,
    module: { module: 'triage', params: { below: 0.3, mult: 2 } },
  },
  {
    id: 'plague',
    owner: 'quartermaster',
    tier: 'combo',
    requires: ['venom_bolts', 'wide_aura'],
    module: { module: 'plague' },
  },
];

// ---- commander ----------------------------------------------------------------------------------

export const commanderCards: CardDef[] = [
  {
    id: 'bladework',
    owner: 'commander',
    tier: 'common',
    stats: [{ stat: 'arcDeg', addPct: 0.2, scope: 'main' }],
  },
  {
    id: 'forced_march',
    owner: 'commander',
    tier: 'common',
    module: { module: 'forced_march', params: { pct: 0.2, auraMs: 200 } },
  },
  // Longer morale (the super's effect durations × `durationMs`).
  {
    id: 'rally_cry',
    owner: 'commander',
    tier: 'rare',
    stats: [{ stat: 'durationMs', addPct: 0.3, scope: 'super' }],
  },
  {
    id: 'siege_breakers',
    owner: 'commander',
    tier: 'rare',
    favoredEnemy: 'siege',
    module: { module: 'siege_breakers', params: { pct: 0.5 } },
  },
  {
    id: 'veterans',
    owner: 'commander',
    tier: 'rare',
    module: { module: 'veterans', params: { gain: 0.1, max: 5 } },
  },
  {
    id: 'last_stand',
    owner: 'commander',
    tier: 'rare',
    module: { module: 'last_stand', params: { pct: 0.15 } },
  },
  {
    id: 'vanguard',
    owner: 'commander',
    tier: 'rare',
    module: { module: 'vanguard', params: { radius: 3, reduction: 0.2, auraMs: 200 } },
  },
  {
    id: 'warcry',
    owner: 'commander',
    tier: 'combo',
    requires: ['rally_cry', 'vanguard'],
    module: { module: 'warcry', params: { radius: 4, strength: 0.2, durationMs: 4000 } },
  },
];

export const cards: CardDef[] = [
  ...commonCards,
  ...engineerCards,
  ...wardenCards,
  ...quartermasterCards,
  ...commanderCards,
];

// ==== Team shop ==================================================================================
// Team shop items (SPEC §3.4, §3.5, §6.2): crates at the depot price, rising repair, the 3 sentry
// upgrades, squad stats after regular waves, structure tiers, Charged walls (the `spiked_walls` item)
// and the Quartermaster-only base armor and emergency kit. Prices rise with each tier; building
// upgrades apply to every structure of that type, including ones built later. Items are shown only
// when the team can use them (`visibleIf`). Every number is a starting value (§14 #2).

/** Items at or above this price ask for a press-and-hold to confirm (§6.2, ~0.6 s). */
export const HOLD_CONFIRM_PRICE = 10;

const ENGINEER = { teamHasAny: ['engineer' as const] };
const WARDEN = { teamHasAny: ['warden' as const] };

export const crate = {
  id: 'crate',
  tiers: [{ price: 2, effect: { kind: 'crates', count: 1 } }],
  repeatable: true,
} satisfies ShopItemDef;

/** Repeatable; the price climbs this ladder per purchase and stays at the last step (§3.4). */
export const repair = {
  id: 'repair',
  tiers: [4, 6, 8, 10, 12, 14].map((price) => ({
    price,
    effect: { kind: 'repair' as const, hp: 150 },
  })),
  repeatable: true,
} satisfies ShopItemDef;

export const archerDamage = {
  id: 'archer_damage',
  tiers: [
    {
      price: 8,
      effect: { kind: 'stats', target: 'archers', stats: [{ stat: 'damage', addPct: 0.5 }] },
    },
  ],
} satisfies ShopItemDef;

export const archerRange = {
  id: 'archer_range',
  tiers: [
    {
      price: 8,
      effect: { kind: 'stats', target: 'archers', stats: [{ stat: 'range', addPct: 0.25 }] },
    },
  ],
} satisfies ShopItemDef;

export const archerThird = {
  id: 'archer_third',
  tiers: [{ price: 12, effect: { kind: 'archers', add: 1 } }],
} satisfies ShopItemDef;

/**
 * Squad stats (§6.2, §8): one tier per regular (non-boss) wave cleared, sold only in the build phase
 * after a regular wave; squad size grows after the boss waves instead.
 */
export const squadStats = {
  id: 'squad_stats',
  tiers: Array.from({ length: 12 }, (_, i) => ({
    price: 5 + i,
    effect: {
      kind: 'stats' as const,
      target: 'squad' as const,
      stats: [
        { stat: 'maxHp' as const, addPct: 0.1 },
        { stat: 'damage' as const, addPct: 0.1 },
      ],
    },
  })),
  visibleIf: { teamHasAny: ['commander'] },
  afterRegularWaveOnly: true,
} satisfies ShopItemDef;

const tiers3 = (prices: [number, number, number], effect: ShopItemDef['tiers'][number]['effect']) =>
  prices.map((price) => ({ price, effect }));

export const arrowRate = {
  id: 'arrow_rate',
  tiers: tiers3([6, 10, 14], {
    kind: 'stats',
    target: 'arrow_tower',
    stats: [{ stat: 'attackSpeed', addPct: 0.2 }],
  }),
  visibleIf: ENGINEER,
} satisfies ShopItemDef;

export const bombRadius = {
  id: 'bomb_radius',
  tiers: tiers3([6, 10, 14], {
    kind: 'stats',
    target: 'bomb_tower',
    stats: [{ stat: 'radius', addPct: 0.15 }],
  }),
  visibleIf: ENGINEER,
} satisfies ShopItemDef;

export const towerHp = {
  id: 'tower_hp',
  tiers: tiers3([5, 8, 12], {
    kind: 'stats',
    target: 'towers',
    stats: [{ stat: 'maxHp', addPct: 0.25 }],
  }),
  visibleIf: ENGINEER,
} satisfies ShopItemDef;

export const wallHp = {
  id: 'wall_hp',
  tiers: tiers3([4, 7, 10], {
    kind: 'stats',
    target: 'wall',
    stats: [{ stat: 'maxHp', addPct: 0.3 }],
  }),
  visibleIf: WARDEN,
} satisfies ShopItemDef;

/** More discharges per net (§7.1), existing nets included. */
export const snareCharges = {
  id: 'snare_charges',
  tiers: tiers3([4, 7, 10], { kind: 'discharges', add: 2 }),
  visibleIf: WARDEN,
} satisfies ShopItemDef;

/** Charged walls (neon knights' name, §7.2): enemies that attack a wall take `damage` per hit. */
export const spikedWalls = {
  id: 'spiked_walls',
  tiers: [
    {
      price: 10,
      effect: {
        kind: 'module',
        target: 'wall',
        module: { module: 'charged_walls', params: { damage: 10 } },
      },
    },
  ],
  visibleIf: WARDEN,
} satisfies ShopItemDef;

/** Quartermaster-only (§6.2): the Citadel takes less damage (capped with every damage reduction). */
export const baseArmor = {
  id: 'base_armor',
  tiers: tiers3([8, 12, 16], {
    kind: 'stats',
    target: 'base',
    stats: [{ stat: 'damageReduction', add: 0.1 }],
  }),
  visibleIf: { teamHasAny: ['quartermaster'] },
  qmOnly: true,
} satisfies ShopItemDef;

/** Quartermaster-only (§3.4): held one at a time, used with the action button in the repair zone. */
export const emergencyKit = {
  id: 'emergency_kit',
  tiers: [{ price: 6, effect: { kind: 'kit' } }],
  visibleIf: { teamHasAny: ['quartermaster'] },
  qmOnly: true,
  repeatable: true,
} satisfies ShopItemDef;

export const shop: ShopItemDef[] = [
  crate,
  repair,
  archerDamage,
  archerRange,
  archerThird,
  squadStats,
  arrowRate,
  bombRadius,
  towerHp,
  wallHp,
  snareCharges,
  spikedWalls,
  baseArmor,
  emergencyKit,
];
