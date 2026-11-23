// Balance sheet (SPEC §15.4): every number that tunes Fort Frenzy lives in this one file. The
// Citadel and run rules, difficulty and player scaling, the classes, the knights and their builds, enemies
// and the Colossus, waves, upgrade cards, the team shop and the balance harness, typed with `satisfies` against ./types. Units:
// distances in tiles, speeds in tiles/s, times in ms (the sim converts them to steps at load), damage
// and HP as plain numbers, `*Pct` and multipliers as fractions. The sim keeps no tuning numbers of its
// own: card, passive and boss modules read every param from here (a missing one throws, and
// content.test builds them all). Every value is a starting value for playtesting (§14 #2). The map's
// layout is ./map.ts.
import type {
  BaseDef,
  BuildDef,
  CardDef,
  ClassDef,
  DifficultyDef,
  EnemyDef,
  HarnessDef,
  KnightDef,
  PlayerCountRow,
  RulesDef,
  ShopItemDef,
  StatMod,
  WaveDef,
} from './types';

// ==== Citadel and run rules ======================================================================
// The Citadel (SPEC §3.3–§3.5) and the run's rules and timings (§4–§6, §10, §11).
// Starting values for playtesting (§14).

export const base = {
  hp: 1000,
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
  coinRate: 1,
  countdownMs: 3000,
  // 20 s; a card not confirmed by then is picked at random (§10.2).
  buildCapMs: 20_000,
  victoryMs: 5000,
  defeatMs: 4000,
  flareMs: 1000,
  inputStaleMs: 250,
  // HP tiers multiply it (classes): tank 176, marksman 88, support 99, control 110.
  knightHp: 110,
  // Damage taken, a main attack or a super restarts the delay (§5, RC1).
  regen: { delayMs: 5000, pct: 0.08, everyMs: 1000 },
  // Quick Recovery's −2 s a stack never takes a respawn below these (§5).
  respawnFloorMs: { solo: 4000, team: 5000 },
  hot: { share: 0.55 },
  // In front of the gate.
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
    // Deadeye's shorter Steady Aim wait never drops below a fifth of it.
    durationMs: { pctMin: -0.8 },
  },
  separation: 0.3,
  knockbackDecay: 0.85,
  projectileRadius: 0.12,
  enemySwingSlack: 0.25,
  enemyShotSlack: 1,
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
  {
    id: 'easy',
    budget: 0.75,
    enemyHp: 0.8,
    enemyDamage: 0.75,
    baseHp: 1.25,
    coinIncome: 1.25,
    respawn: 0.8,
  },
  { id: 'normal', budget: 1, enemyHp: 1, enemyDamage: 1, baseHp: 1, coinIncome: 1, respawn: 1 },
  {
    id: 'hard',
    budget: 1.25,
    enemyHp: 1.2,
    enemyDamage: 1.25,
    baseHp: 0.85,
    coinIncome: 0.9,
    respawn: 1.2,
  },
];

/** The player-count table (§9.4): one row per player count, fixed at each wave start. */
export const scaling: PlayerCountRow[] = [
  { players: 1, budget: 0.6, bossHp: 0.6, respawnMs: 6000 },
  { players: 2, budget: 1, bossHp: 1, respawnMs: 10_000 },
  { players: 3, budget: 1.25, bossHp: 1.25, respawnMs: 10_000 },
  { players: 4, budget: 1.5, bossHp: 1.5, respawnMs: 10_000 },
  { players: 5, budget: 1.75, bossHp: 1.75, respawnMs: 15_000 },
  { players: 6, budget: 2, bossHp: 2, respawnMs: 15_000 },
];

// ==== Classes ====================================================================================
// The classes (SPEC §8.1): HP tier (× rules.knightHp) and damage band (× the knight's main and super
// damage, applied when they fire); class growth per wave cleared comes with RD11.

export const classes: ClassDef[] = [
  { id: 'tank', hp: 1.6, damage: 0.9, growth: { regular: [], boss: [] } },
  { id: 'marksman', hp: 0.8, damage: 1.15, growth: { regular: [], boss: [] } },
  { id: 'support', hp: 0.9, damage: 0.8, growth: { regular: [], boss: [] } },
  { id: 'control', hp: 1, damage: 0.95, growth: { regular: [], boss: [] } },
];

// ==== Knights =====================================================================================
// The knights (SPEC §8.2, §10.1 input table). Starting values for playtesting (§14). Meters start the
// run full (§7.2); the Warden's fill rates are set (RD3), the others' with their builds (RD7–RD9).
// Each knight's kit milestone retunes its own section.

export const ranger = {
  id: 'ranger',
  role: 'marksman',
  moveSpeed: 4.5,
  radius: 0.32,
  // Longbow: the longest range in the game (§8). Bolts fly at render PROJECTILE_SPEEDS.bolt (26 t/s,
  // FF3-fix-1; BUILD_PLAN §8 FF7).
  main: {
    shape: 'projectile',
    damage: 30,
    range: 9,
    cooldownMs: 600,
    speed: 22,
    hitsFlyers: true,
  },
  // A wide circle around the Ranger: light area damage and knockback (§8). Radius 3 → 3.5 (C3).
  super: {
    shape: 'circle',
    damage: 20,
    range: 0,
    radius: 3.5,
    cooldownMs: 500,
    knockback: 2.5,
    hitsFlyers: true,
  },
  build: 'mine',
  input: { main: 'aimed', super: 'tap', build: 'tap' },
  hitsFlyers: true,
  /** Super charge per point of damage dealt (200 damage fills it). */
  superCharge: { perDamage: 0.005 },
  // A mine about every 9–10 s of steady shooting; 40 s with no damage dealt (RD7, a starting value).
  meter: { perSec: 0.025, perPoint: 0.0015, sources: ['damage'] },
  passiveCard: 'steady_aim',
} satisfies KnightDef;

// Artificer (support, §6, §8): neon knights' Artificer.
export const artificer = {
  id: 'artificer',
  role: 'support',
  moveSpeed: 4.6,
  radius: 0.32,
  // 3–4 nanite bolts in a narrow cone, medium-long range (§8). Bolts fly
  // at render PROJECTILE_SPEEDS['nanite-bolt'] (20 t/s, FF3-fix-1).
  main: {
    shape: 'projectile',
    damage: 12,
    range: 6.5,
    cooldownMs: 700,
    count: 4,
    spreadDeg: 16,
    speed: 20,
    hitsFlyers: true,
  },
  // A very wide, long cone: heals the knights it reaches (not himself); it hurts no one (§8).
  super: {
    shape: 'cone',
    damage: 0,
    range: 8,
    arcDeg: 110,
    cooldownMs: 500,
    hitsFlyers: true,
    heal: 40,
  },
  build: 'beacon',
  input: { main: 'aimed', super: 'aimed', build: 'aimed' },
  hitsFlyers: true,
  superCharge: { perDamage: 0.005, perHeal: 0.002 },
  meter: { perSec: 0, perPoint: 0, sources: ['damage', 'healing'] },
  passiveCard: 'field_medic',
  // Field Medic heals nearby players every second in combat; its healing charges the super at
  // `chargeRate` per HP healed, slower than damage does (§8).
  passive: {
    module: 'field_medic',
    params: { radius: 2.5, heal: 3, everyMs: 1000, chargeRate: 0.002 },
  },
} satisfies KnightDef;

// Commander (squad leader, §8).
export const commander = {
  id: 'commander',
  role: 'control',
  moveSpeed: 4.3,
  radius: 0.34,
  // Sword slash in a short arc in front of him; aimed, a quick tap auto-aims (FF7-fix-3, C3).
  main: {
    shape: 'arc',
    damage: 28,
    range: 1.6,
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
  build: 'rally_flag',
  input: { main: 'aimed', super: 'tap', build: 'aimed' },
  hitsFlyers: false,
  superCharge: { perDamage: 0.008, perSquadDamage: 0.004 },
  meter: { perSec: 0, perPoint: 0, sources: ['damage'] },
  passiveCard: 'morale',
  // Lead from the Front: his soldiers within `radius` deal +`damagePct` (a refreshed aura).
  passive: {
    module: 'lead_from_the_front',
    params: { radius: 3, damagePct: 0.25, auraMs: 200 },
  },
  // 2 soldiers to start, up to 4 (RD9's Reinforcements fills it).
  squad: {
    start: 2,
    cap: 4,
    soldier: {
      hp: 60,
      moveSpeed: 4.4,
      radius: 0.24,
      attack: { shape: 'arc', damage: 8, range: 0.5, cooldownMs: 900, hitsFlyers: false },
    },
    followRadius: 1.4,
    aggro: { radius: 3, leash: 5 },
    hurry: { at: 3, factor: 1.3 },
    formation: { flagRing: 0.8, followSpread: 0.6 },
  },
} satisfies KnightDef;

/**
 * Warden (tank, §8): an aimed ground slam in a short arc (a quick tap auto-aims; FF7-fix-3, C3), a
 * longer aimed stomp whose arc stuns. Both attacks wind up, so the hammer and the foot land on the
 * TV when the damage does (`windupMs` = the clips' impact times,
 * render/clips/warden.ts; src/host/__tests__/speeds.test.ts keeps them equal).
 */
export const warden = {
  id: 'warden',
  role: 'tank',
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
  // Jump slam (§8.2, RD3): a slow airborne wind-up (RC1: the clip reads about 2 s), then an arc as wide
  // as the slam's but longer, with less damage, that stuns.
  super: {
    shape: 'arc',
    damage: 25,
    range: 4.7,
    arcDeg: 102,
    cooldownMs: 600,
    windupMs: 1800,
    hitsFlyers: false,
    effects: [{ effect: 'stun', strength: 1, durationMs: 1800 }],
  },
  build: 'shield_gen',
  input: { main: 'aimed', super: 'aimed', build: 'aimed' },
  hitsFlyers: false,
  /** ~185 damage fills it (160 before FF11-fix-1): the slam hits groups, so the stomp comes round often. */
  superCharge: { perDamage: 0.0054 },
  // A full meter in 45 s alone, or from about 500 damage (RD3 starting values).
  meter: { perSec: 1 / 45, perPoint: 0.002, sources: ['damage'] },
  passiveCard: 'challenger',
} satisfies KnightDef;

export const knights: KnightDef[] = [ranger, artificer, commander, warden];

// ==== Builds =====================================================================================
// One build per knight (SPEC §7.4). Starting values: RD3 (shield generator) and RD7–RD9 tune them.

export const shieldGen = {
  id: 'shield_gen',
  input: 'aimed',
  // RC1: a slower lob, 1 s at full range (was 0.5 s). A quick tap at his feet keeps the short minimum.
  throw: { range: 6, speed: 6, minFlightMs: 300 },
  hp: 300,
  radius: 2.5,
  bodyRadius: 0.4,
  maxActive: 1,
  traits: { targetable: true, dealsDamage: false, hidden: false },
  armMs: 400,
  guard: 0.3,
  // The guard aura lasts this long past each combat step's re-application (§7.4).
  module: { module: 'shield_gen', params: { auraMs: 100 } },
} satisfies BuildDef;

export const mine = {
  id: 'mine',
  input: 'tap',
  charges: 1,
  radius: 2,
  bodyRadius: 0.3,
  maxActive: 3,
  traits: { targetable: false, dealsDamage: true, hidden: true },
  triggerRadius: 1,
  triggerMs: 400,
  armMs: 1000,
  damage: 60,
  knockback: 1,
  // Shrapnel Charge shortens the trigger delay, never below this.
  module: { module: 'mine', params: { minTriggerMs: 120 } },
} satisfies BuildDef;

export const beacon = {
  id: 'beacon',
  input: 'aimed',
  throw: { range: 6, speed: 12, minFlightMs: 300 },
  hp: 200,
  radius: 2.5,
  bodyRadius: 0.35,
  maxActive: 1,
  traits: { targetable: true, dealsDamage: false, hidden: false },
  armMs: 400,
  heal: { amount: 6, everyMs: 1000 },
} satisfies BuildDef;

export const rallyFlag = {
  id: 'rally_flag',
  input: 'aimed',
  throw: { range: 8, speed: 14, minFlightMs: 250 },
  radius: 0.8,
  bodyRadius: 0.3,
  maxActive: 1,
  traits: { targetable: false, dealsDamage: false, hidden: false },
} satisfies BuildDef;

export const builds: BuildDef[] = [shieldGen, mine, beacon, rallyFlag];

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
    damage: 5,
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

/** Brute: huge HP, a long wind-up is its tell (RD10 sends it after builds). */
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
  field: 'ground',
  attack: {
    shape: 'arc',
    damage: 40,
    range: 0.55,
    cooldownMs: 1800,
    windupMs: 700,
    arcDeg: 100,
    hitsFlyers: false,
  },
  aggro: { radius: 2.5, leash: 4 },
  // Snares slow it at half strength (§7.1, FF8: `slowResist` in the effect pipeline).
  slowResist: 0.5,
} satisfies EnemyDef;

/** Wasp drone: flies straight in and shoots its stinger (render's wasp-shot speed, 16 tiles/s). */
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

/** Bombard: stops at range (under the Ranger's 9) and shells the base. */
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
  speed: 1.5 * SPEED,
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
  // Paths round sentry range (+4 per covering attacker) and retargets on a player 2 tiles
  // closer (C3, FF10-fix-1).
  // RD10 turns on the lock-on sprint and the hidden-build pricing.
  hunt: {
    closeRange: 1.5,
    retargetTiles: 2,
    threatCost: 4,
    threatPad: 1,
    hiddenCost: 4,
    lockRange: 5,
    sprint: 1.4,
  },
} satisfies EnemyDef;

/**
 * The Colossus (§9.2, FF11): a slow walker on the ground field. `attack` is its slam (a 1.5 s red
 * circle in front of it); the Citadel takes `baseMult` × its slams.
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
  field: 'ground',
  attack: {
    shape: 'circle',
    damage: 60,
    range: 1.2,
    cooldownMs: 2500,
    windupMs: 1500,
    radius: 1.5,
    hitsFlyers: false,
  },
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
      // The Citadel takes this × its slam damage.
      baseMult: 1.5,
      // Boulder throw (Mk II+): wind-up, then a lob at the largest group of players.
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
      // Back on its feet, stuns don't count for `stunImmuneMs` (FF11-fix-1: no Warden stun-lock).
      staggerPerHp: 3,
      staggerStun: 0.25,
      stunLockMs: 2500,
      stunImmuneMs: 4000,
      staggerMs: 3000,
      staggerBonus: 0.5,
      // Grunt and Swarm escorts walk in with Mk II and III (§9.2 wave 10).
      escortGrunts: 2,
      escortSwarms: 4,
    },
  },
} satisfies EnemyDef;

export const enemies: EnemyDef[] = [grunt, runner, swarm, brute, flyer, siege, hunter, colossus];

// ==== Waves ======================================================================================
// Wave data (SPEC §9.3, §9.4): budget, allowed types, guaranteed spawns, the hot-side schedule (RD3).
// Budgets are for 2 players at Normal; the player-count table and difficulty multiply them at wave
// start. Each wave guarantees the type it introduces; every pool holds the Grunt (cost 1), so the
// generator spends to within 1 of the budget. Every portal is live from wave 1 (§3.1). Waves 5, 10
// and 15 carry the Colossus (`boss`; §9.2: a light Grunt stream; Grunts and Swarms; final-phase
// Runners).
// Starting values for playtesting (§14): about 16 minutes of combat over 15 waves.

const HOLD = { mode: 'wave', shifts: 0 } as const;
const SHIFT1 = { mode: 'wave', shifts: 1 } as const;
const SHIFT2 = { mode: 'wave', shifts: 2 } as const;
const GROUP = { mode: 'group' } as const;

export const waves: WaveDef[] = [
  {
    n: 1,
    budget: 12,
    allowed: ['grunt'],
    hot: HOLD,
    guaranteed: [{ enemy: 'grunt', count: 1 }],
    durationMs: 30_000,
  },
  {
    n: 2,
    budget: 16,
    allowed: ['grunt', 'runner'],
    hot: HOLD,
    guaranteed: [{ enemy: 'runner', count: 2 }],
    durationMs: 40_000,
  },
  {
    n: 3,
    budget: 22,
    allowed: ['grunt', 'runner', 'swarm'],
    hot: HOLD,
    guaranteed: [{ enemy: 'swarm', count: 1 }],
    durationMs: 45_000,
  },
  {
    n: 4,
    budget: 26,
    allowed: ['grunt', 'runner', 'swarm', 'brute'],
    hot: SHIFT1,
    guaranteed: [{ enemy: 'brute', count: 1 }],
    durationMs: 50_000,
  },
  {
    n: 5,
    budget: 20,
    allowed: ['grunt'],
    hot: HOLD,
    guaranteed: [],
    durationMs: 60_000,
    boss: { id: 'colossus', mk: 1 },
  },
  {
    n: 6,
    budget: 30,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer'],
    hot: SHIFT1,
    guaranteed: [{ enemy: 'flyer', count: 2 }],
    durationMs: 55_000,
  },
  {
    n: 7,
    budget: 34,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege'],
    hot: SHIFT1,
    guaranteed: [{ enemy: 'siege', count: 1 }],
    durationMs: 60_000,
  },
  {
    n: 8,
    budget: 40,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    hot: SHIFT1,
    guaranteed: [{ enemy: 'hunter', count: 2 }],
    durationMs: 65_000,
  },
  {
    n: 9,
    budget: 46,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    hot: SHIFT2,
    guaranteed: [],
    durationMs: 70_000,
  },
  {
    n: 10,
    budget: 30,
    allowed: ['grunt', 'swarm'],
    hot: HOLD,
    guaranteed: [],
    durationMs: 75_000,
    boss: { id: 'colossus', mk: 2 },
  },
  {
    n: 11,
    budget: 58,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    hot: SHIFT2,
    guaranteed: [],
    durationMs: 75_000,
  },
  {
    n: 12,
    budget: 68,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    hot: GROUP,
    guaranteed: [
      { enemy: 'brute', count: 2 },
      { enemy: 'siege', count: 1 },
    ],
    durationMs: 80_000,
  },
  {
    n: 13,
    budget: 72,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    hot: GROUP,
    guaranteed: [],
    durationMs: 80_000,
  },
  {
    n: 14,
    budget: 76,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    hot: GROUP,
    guaranteed: [
      { enemy: 'brute', count: 2 },
      { enemy: 'hunter', count: 2 },
      { enemy: 'siege', count: 1 },
    ],
    durationMs: 85_000,
  },
  {
    n: 15,
    budget: 44,
    allowed: ['grunt', 'runner', 'swarm'],
    hot: GROUP,
    guaranteed: [{ enemy: 'runner', count: 4 }],
    durationMs: 90_000,
    boss: { id: 'colossus', mk: 3 },
  },
];

// ==== Upgrade cards ==============================================================================
// Upgrade cards (SPEC §6.1): the 8 shared commons (numbers tuned per class, `perKnight`), then each
// class's 2 commons, 5 rares and 1 combo, in the spec's table order. Stat cards change stats (attack
// stats scoped to their button, so aim previews read the effective values); the rest are sim
// modules (src/host/sim/cards/). Every number is a starting value for playtesting (§14 #2).
// Stacks add (×N); range, movement speed and damage reduction are capped by the rules (+40%).

const per = (
  stat: StatMod['stat'],
  key: 'addPct' | 'add',
  ranger: number,
  warden: number,
  artificer: number,
  commander: number,
): CardDef['perKnight'] => {
  const mod = (v: number): StatMod[] => [key === 'add' ? { stat, add: v } : { stat, addPct: v }];
  return {
    ranger: mod(ranger),
    warden: mod(warden),
    artificer: mod(artificer),
    commander: mod(commander),
  };
};

// ---- shared commons -----------------------------------------------------------------------------

export const commonCards: CardDef[] = [
  {
    id: 'vitality',
    owner: 'common',
    tier: 'common',
    perKnight: per('maxHp', 'addPct', 0.12, 0.1, 0.12, 0.1),
  },
  {
    id: 'might',
    owner: 'common',
    tier: 'common',
    perKnight: per('damage', 'addPct', 0.1, 0.1, 0.12, 0.1),
  },
  {
    id: 'haste',
    owner: 'common',
    tier: 'common',
    perKnight: per('attackSpeed', 'addPct', 0.1, 0.1, 0.1, 0.12),
  },
  {
    id: 'reach',
    owner: 'common',
    tier: 'common',
    perKnight: per('range', 'addPct', 0.08, 0.1, 0.1, 0.12),
  },
  {
    id: 'swiftness',
    owner: 'common',
    tier: 'common',
    perKnight: per('moveSpeed', 'addPct', 0.08, 0.1, 0.08, 0.08),
  },
  {
    id: 'focus',
    owner: 'common',
    tier: 'common',
    perKnight: per('superCharge', 'addPct', 0.12, 0.12, 0.15, 0.12),
  },
  {
    id: 'toughness',
    owner: 'common',
    tier: 'common',
    perKnight: per('damageReduction', 'add', 0.06, 0.08, 0.06, 0.07),
  },
  // −2 s respawn, never below 5 s (the rules cap Σ add at −5000 ms on a 10 s respawn).
  {
    id: 'quick_recovery',
    owner: 'common',
    tier: 'common',
    perKnight: per('respawnMs', 'add', -2000, -2000, -2000, -2000),
  },
];

// ---- ranger -----------------------------------------------------------------------------------

export const rangerCards: CardDef[] = [
  {
    id: 'quick_draw',
    owner: 'ranger',
    tier: 'common',
    stats: [{ stat: 'projectileSpeed', addPct: 0.25, scope: 'main' }],
  },
  {
    id: 'blast_radius',
    owner: 'ranger',
    tier: 'common',
    stats: [{ stat: 'radius', addPct: 0.2, scope: 'super' }],
  },
  {
    id: 'shrapnel_charge',
    owner: 'ranger',
    tier: 'common',
    stats: [
      { stat: 'buildTriggerMs', addPct: -0.2, scope: 'build' },
      { stat: 'buildRadius', addPct: 0.2, scope: 'build' },
    ],
  },
  {
    id: 'fire_arrows',
    owner: 'ranger',
    tier: 'rare',
    module: { module: 'fire_arrows', params: { tick: 3, durationMs: 3000 } },
  },
  {
    id: 'piercing_shot',
    owner: 'ranger',
    tier: 'rare',
    module: { module: 'piercing_shot', params: { pierce: 1 } },
  },
  {
    id: 'skyhunter',
    owner: 'ranger',
    tier: 'rare',
    favoredEnemy: 'flyer',
    module: { module: 'skyhunter', params: { enemies: 'flyer', pct: 0.5 } },
  },
  // The Ranger's passive card (§6.1, §8.2): standing still boosts his main's damage and range.
  {
    id: 'steady_aim',
    owner: 'ranger',
    tier: 'rare',
    unique: true,
    module: { module: 'steady_aim', params: { stillMs: 600, damagePct: 0.25, rangePct: 0.2 } },
  },
  // Steady Aim's activation time is its passive's duration (600 ms → 360 ms).
  {
    id: 'deadeye',
    owner: 'ranger',
    tier: 'rare',
    requires: ['steady_aim'],
    stats: [{ stat: 'durationMs', addPct: -0.4 }],
  },
  {
    id: 'minefield',
    owner: 'ranger',
    tier: 'rare',
    unique: true,
    stats: [{ stat: 'buildMax', add: 1, scope: 'build' }],
  },
  {
    id: 'volley',
    owner: 'ranger',
    tier: 'rare',
    module: { module: 'volley', params: { every: 4, minEvery: 2, arrows: 3, spreadDeg: 14 } },
  },
  {
    id: 'wildfire',
    owner: 'ranger',
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
      // Enemies the jump slam hits are slowed for `slowMs` (RC1); stacked slows cap at `maxSlow`.
      params: { slow: 0.35, maxSlow: 0.9, slowMs: 5000 },
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
    id: 'unshakable',
    owner: 'warden',
    tier: 'rare',
    unique: true,
    module: { module: 'unshakable' },
  },
];

// ---- artificer ------------------------------------------------------------------------------

export const artificerCards: CardDef[] = [
  {
    id: 'venom_bolts',
    owner: 'artificer',
    tier: 'rare',
    module: { module: 'venom_bolts', params: { tick: 2, durationMs: 4000 } },
  },
  {
    id: 'overflow',
    owner: 'artificer',
    tier: 'rare',
    unique: true,
    module: { module: 'overflow', params: { cap: 40, durationMs: 6000 } },
  },

  {
    id: 'wide_aura',
    owner: 'artificer',
    tier: 'rare',
    stats: [{ stat: 'auraRadius', addPct: 0.3 }],
  },
  {
    id: 'triage',
    owner: 'artificer',
    tier: 'rare',
    unique: true,
    module: { module: 'triage', params: { below: 0.3, mult: 2 } },
  },
  {
    id: 'plague',
    owner: 'artificer',
    tier: 'combo',
    requires: ['venom_bolts', 'wide_aura'],
    module: { module: 'plague' },
  },
];

// ---- commander ----------------------------------------------------------------------------------

export const commanderCards: CardDef[] = [
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
  ...rangerCards,
  ...wardenCards,
  ...artificerCards,
  ...commanderCards,
];

// ==== Team shop ==================================================================================
// Team shop items (SPEC §3.4, §3.5, §6.2): rising repair, the 3 sentry upgrades, base max HP and base
// armor. Prices rise with each tier; every item is always shown. Every number is a starting value
// (§14 #2; RD11 sets the pricing).

/** Items at or above this price ask for a press-and-hold to confirm (§6.2, ~0.6 s). */
export const HOLD_CONFIRM_PRICE = 10;

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

const tiers3 = (prices: [number, number, number], effect: ShopItemDef['tiers'][number]['effect']) =>
  prices.map((price) => ({ price, effect }));

/** Each tier raises the Citadel's max HP and its current HP by the same amount (§6.2). */
export const baseHp = {
  id: 'base_hp',
  tiers: tiers3([6, 10, 14], {
    kind: 'stats',
    target: 'base',
    stats: [{ stat: 'maxHp', add: 150 }],
  }),
} satisfies ShopItemDef;

/** The Citadel takes less damage (capped with every damage reduction). */
export const baseArmor = {
  id: 'base_armor',
  tiers: tiers3([8, 12, 16], {
    kind: 'stats',
    target: 'base',
    stats: [{ stat: 'damageReduction', add: 0.1 }],
  }),
} satisfies ShopItemDef;

export const shop: ShopItemDef[] = [
  repair,
  archerDamage,
  archerRange,
  archerThird,
  baseHp,
  baseArmor,
];

// ==== Harness ====================================================================================
// The balance harness (SPEC §15.9; a report, never a gate): each knight alone against the standard
// wave from one portal (RD3 runs it).

export const harness = {
  wave: [
    { enemy: 'grunt', count: 12 },
    { enemy: 'runner', count: 4 },
    { enemy: 'swarm', count: 1 },
    { enemy: 'brute', count: 1 },
  ],
  portal: 'bottom-w',
  difficulty: 'normal',
  seeds: [1, 2, 3, 4, 5],
  bands: [0.2, 0.25],
  // The wave's groups spread over this long (as wave 1); a knight that hasn't cleared it in
  // `capMs` is reported as not clearing.
  durationMs: 30_000,
  capMs: 300_000,
} satisfies HarnessDef;
