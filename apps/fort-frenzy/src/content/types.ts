// Gameplay config types (SPEC §15.4). Content files in src/content/ are TS data typed with
// `satisfies` against these. Units: distances in tiles, speeds in tiles/s, times in ms (the sim
// converts to steps at load), damage and HP as plain numbers. Presentation never lives here (§2.1).
// Frozen after RD2 (REDESIGN_BUILD_PLAN §3): additive changes only. Tuning values in src/content/ are
// not frozen. RD2 implemented the v2 shapes: `ClassDef` + `KnightDef` (was CharacterDef), `BuildDef`
// (was StructureDef), `PlayerCountRow` (was ScalingDef), `HarnessDef`, portals on `MapDef`, the
// hot-side schedule on `WaveDef`. Marked "until RD#": transitional fields the named milestone removes.
import type {
  BuildId,
  CardId,
  DifficultyId,
  EffectId,
  EnemyId,
  KnightId,
  PortalId,
  RoleId,
  ShopItemId,
  SideId,
} from '../shared/ids';

// ---- geometry -----------------------------------------------------------------------------------

/** World position or direction, in tiles (−1..1 for input directions). */
export interface Vec2 {
  x: number;
  y: number;
}

/** A grid tile: [col, row], row 0 at the top (the Citadel's edge). */
export type Tile = readonly [col: number, row: number];

/** What a map tile is (SPEC §3.1). `blocked` is impassable (none on the v1 map, §15.5). */
export type TileKind = 'open' | 'blocked' | 'citadel' | 'portal';

// ---- stats and modules --------------------------------------------------------------------------

/**
 * Stats a modifier can change (SPEC §6.1, §15.3). `value = base × (1 + clamp(Σ addPct, min, cap)) + Σ add`.
 * Append-only after RD2. The tower-defense supply stats and `repairRate` are gone.
 */
export const STAT_IDS = [
  'maxHp',
  'damage',
  'attackSpeed',
  'range',
  'moveSpeed',
  'superCharge',
  'damageReduction',
  'respawnMs',
  'projectileSpeed',
  'arcDeg',
  'radius',
  'durationMs',
  'stunMs',
  'healing',
  'knockback',
  'throwRange',
  'throwSpeed',
  'auraRadius',
  // redesign
  /** Build meter fill rate (Tinkerer). */
  'buildCharge',
  /** The knight's HP builds (Reinforced Generator, Booster Beacon). */
  'buildHp',
  /** Effect / blast radius (Wide Field, Shrapnel Charge). */
  'buildRadius',
  /** Guard strength, heal per pulse (Reinforced Generator, Booster Beacon). */
  'buildPower',
  /** Mine trigger delay (Shrapnel Charge: negative addPct). */
  'buildTriggerMs',
  /** Extra active builds (Minefield: add 1). */
  'buildMax',
  /** Reinforced Ranks: add 1. */
  'squadCap',
  'squadHp',
  'squadDamage',
  'squadSpeed',
] as const;
export type StatId = (typeof STAT_IDS)[number];

/** One stat change. `addPct` is a fraction (+10% = 0.1); `add` is in the stat's own unit. */
export interface StatMod {
  stat: StatId;
  addPct?: number;
  add?: number;
  /** What the change applies to; omitted = the whole knight. */
  scope?: 'main' | 'super' | 'build' | 'squad';
}

/** A module (passive, card behavior, build, boss) by registry id, built from config params (§15.3). */
export type ModuleRef = { module: string; params?: Record<string, number | string | boolean> };

/** A status effect an attack or build applies (§6.1, §15.3). */
export interface EffectApply {
  effect: EffectId;
  /** Effect-specific: slow fraction, damage per tick, stun has none (1). */
  strength: number;
  durationMs: number;
}

// ---- attacks and units --------------------------------------------------------------------------

export interface AttackDef {
  /** `buff` (until RD9): hits nothing; the super's `effects` go on the Commander and his squad. */
  shape: 'projectile' | 'arc' | 'cone' | 'circle' | 'buff';
  damage: number;
  range: number;
  cooldownMs: number;
  windupMs?: number;
  arcDeg?: number;
  count?: number;
  spreadDeg?: number;
  /** Nanite blast: `count` shots over this long (RD8). */
  burstMs?: number;
  /** Nanite blast: each shot's spot is this fraction of the range, up to the full range. */
  burstMinReach?: number;
  speed?: number;
  hitsFlyers: boolean;
  knockback?: number;
  /** Area radius for `circle` attacks and shells landing (tiles). */
  radius?: number;
  /** Lobbed shells (Bombard): the shortest flight, so a close lob still arcs (ms). */
  minFlightMs?: number;
}

/** Plain unit stats (Commander's soldiers). */
export interface UnitStats {
  hp: number;
  moveSpeed: number;
  radius: number;
  attack: AttackDef;
}

/** A class (§8.1). Keyed by RoleId; a knight names its class. */
export interface ClassDef {
  id: RoleId;
  /** HP tier: × `rules.knightHp` (tank 1.6). */
  hp: number;
  /** Damage band: × main and super damage (tank 0.9; RD3 applies it). */
  damage: number;
  /** Per wave cleared; boss waves use `boss` (RD11). */
  growth: { regular: StatMod[]; boss: StatMod[] };
}

export type InputType = 'aimed' | 'tap';
export type ChargeSource = 'damage' | 'healing';

/** A knight (§8.2). */
export interface KnightDef {
  id: KnightId;
  role: RoleId;
  moveSpeed: number;
  radius: number;
  main: AttackDef;
  /**
   * `heal`: heals allied knights in the cone (Artificer). `spawn`: Reinforcements throws `count`
   * soldiers `throwRange` tiles (Commander, RD9; Rally Cry may double it). `selfEffects` (until RD9):
   * the Commander's morale super's effects on himself only.
   */
  super: AttackDef & {
    effects?: EffectApply[];
    heal?: number;
    spawn?: { count: number; throwRange: number; throwSpeed: number; minFlightMs: number };
    selfEffects?: EffectApply[];
  };
  build: BuildId;
  /** `build` mirrors BuildDef.input. */
  input: { main: InputType; super: InputType; build: InputType };
  /** §9 Flyer spawn rule. */
  hitsFlyers: boolean;
  /** Super charge per point (§8.3): own damage (main and its build's), healing, squad damage. */
  superCharge: { perDamage: number; perHeal?: number; perSquadDamage?: number };
  /** Build meter (§7.2): passive fill per second in combat, plus per point from `sources` (RD3). */
  meter: { perSec: number; perPoint: number; sources: ChargeSource[] };
  /** Its rare, unique passive card (§6.1). */
  passiveCard: CardId;
  /** The always-on passive module (until the knight's kit milestone makes it the passive card). */
  passive?: ModuleRef;
  /** Commander only (§8.4). */
  squad?: {
    /** 2 and 4 to start; the squad stays at `start` until Reinforcements (RD9). */
    start: number;
    cap: number;
    soldier: UnitStats;
    followRadius: number;
    aggro: { radius: number; leash: number };
    hurry?: { at: number; factor: number };
    formation: { flagRing: number; followSpread: number };
  };
}

/** A build (§7). */
export interface BuildDef {
  id: BuildId;
  /** 'tap' at feet, 'aimed' thrown. */
  input: InputType;
  /** Thrown builds. */
  throw?: { range: number; speed: number; minFlightMs: number };
  /** HP builds (targetable). */
  hp?: number;
  /** Charge builds (mines: 1). */
  charges?: number;
  /** Effect radius: field, heal area, blast, flag ring. */
  radius: number;
  /** Its own hitbox (enemies attack it, the Charge crosses it). */
  bodyRadius: number;
  /** 1; mines 3. */
  maxActive: number;
  traits: { targetable: boolean; dealsDamage: boolean; hidden: boolean };
  /** Mines: a ground enemy this close sets it off. */
  triggerRadius?: number;
  /** Mines: delay before the burst. */
  triggerMs?: number;
  /** Placed → live (mine arming, landed → active). */
  armMs?: number;
  /** Mine burst. */
  damage?: number;
  knockback?: number;
  /** Shield generator: damage reduction 0..1 (`guard`). */
  guard?: number;
  /** Beacon pulses. */
  heal?: { amount: number; everyMs: number };
  /** Its behavior's extra params, if any. */
  module?: ModuleRef;
}

export interface EnemyDef {
  id: EnemyId;
  hp: number;
  speed: number;
  radius: number;
  flying: boolean;
  budget: number;
  groupSize?: number;
  ai: 'path' | 'runner' | 'siege' | 'hunter' | 'flyer' | 'boss' | 'swarm' | 'brute';
  /** The wall-smashing field is gone (§15.5). */
  field: 'ground' | 'none';
  attack: AttackDef;
  aggro?: { radius: number; leash: number };
  /** Fraction of any slow resisted: Brutes and the Colossus take slows at half strength (0.5). */
  slowResist?: number;
  boss?: ModuleRef;
  /**
   * Hunter (§9): within `closeRange` it runs straight at its quarry; another player must be
   * `retargetTiles` closer to take over. `lockRange` (about 5 tiles) starts the sprint at × `sprint`
   * (RD10); its field adds `threatCost` per sentry or damage-dealing build covering a tile (range +
   * `threatPad`) and `hiddenCost` on hidden builds' trigger radii.
   */
  hunt?: {
    closeRange: number;
    retargetTiles: number;
    threatCost: number;
    threatPad: number;
    hiddenCost: number;
    lockRange: number;
    sprint: number;
  };
  /**
   * Swarm (FF10): each mite re-rolls a sideways `drift` (fraction of the forward step) and a pace of
   * `pace` + up to `paceRange` × speed every `rollMs`; a re-roll is a stop of `stopMs` with
   * `stopChance`. Ranges are [min, max].
   */
  jitter?: {
    drift: number;
    pace: number;
    paceRange: number;
    stopChance: number;
    rollMs: [number, number];
    stopMs: [number, number];
  };
  /**
   * The body our attacks hit (C4, FF10-fix-2; SPEC §9, §15.3): the drawn torso, head and legs, in
   * tiles of drawn height above the ground point, from `bottom` (0 on the ground; the Wasp's flight
   * height) to `top`; `radius` is half its width. The sim sweeps a circle of `radius` up the screen
   * over that span (`sim/body.ts`). Every enemy has one.
   */
  body?: { radius: number; bottom: number; top: number };
}

// ---- cards and shop -----------------------------------------------------------------------------

export interface CardDef {
  id: CardId;
  owner: KnightId | 'common';
  tier: 'common' | 'rare' | 'combo';
  unique?: boolean;
  /** 1 (improves a passive) or 2 (combo) ids. */
  requires?: CardId[];
  favoredEnemy?: EnemyId;
  requiresKnight?: KnightId;
  stats?: StatMod[];
  module?: ModuleRef;
  /** Commons: numbers tuned per knight. */
  perKnight?: Partial<Record<KnightId, StatMod[]>>;
}

/** What a shop upgrade changes. */
export type UpgradeTarget = 'base' | 'archers';

/** One shop tier's effect (SPEC §6.2). */
export type UpgradeEffect =
  | { kind: 'repair'; hp: number }
  /** Base max HP, base armor, sentries. */
  | { kind: 'stats'; target: UpgradeTarget; stats: StatMod[] }
  | { kind: 'archers'; add: number }
  | { kind: 'module'; target: UpgradeTarget; module: ModuleRef };

/** When a shop item is shown (§6.2: every item is always shown in v1). */
export type Condition = { teamHasAny: KnightId[] } | { waveAtLeast: number };

export interface ShopItemDef {
  id: ShopItemId;
  tiers: { price: number; effect: UpgradeEffect }[];
  visibleIf?: Condition;
  holdToConfirm?: boolean;
  /** Repair: bought again and again, price rising. */
  repeatable?: boolean;
}

// ---- waves, difficulty, map ---------------------------------------------------------------------

/** Hot-side schedule (§9.4; RD3 implements it). */
export type HotSchedule = { mode: 'wave'; shifts: 0 | 1 | 2 } | { mode: 'group' };

export interface WaveDef {
  n: number;
  budget: number;
  allowed: EnemyId[];
  guaranteed: { enemy: EnemyId; count: number; portal?: PortalId }[];
  durationMs: number;
  hot: HotSchedule;
  /** Default 1 (§9.3). */
  enemyMult?: { hp?: number; damage?: number };
  boss?: { id: EnemyId; mk: 1 | 2 | 3 };
}

export interface DifficultyDef {
  id: DifficultyId;
  budget: number;
  enemyHp: number;
  enemyDamage: number;
  baseHp: number;
  coinIncome: number;
  /** Respawn multiplier (§5). */
  respawn: number;
}

/** One row per player count 1–6 (§9.4). */
export interface PlayerCountRow {
  players: number;
  budget: number;
  bossHp: number;
  respawnMs: number;
}

export interface MapDef {
  id: string;
  cols: number;
  rows: number;
  /** ASCII rows, top to bottom, one char per tile. */
  tiles: string[];
  legend: Record<string, TileKind>;
  /** The six portals (§3.1): side, edge tiles, and the spawn point just outside the edge. */
  portals: Record<PortalId, { side: SideId; entry: Tile[]; spawn: Vec2 }>;
}

// ---- base and run rules -------------------------------------------------------------------------

/** The Citadel (SPEC §3.3–§3.5). */
export interface BaseDef {
  hp: number;
  /** Visual damage stages (§3.3), descending HP fractions: cracks, fire, heavy smoke. */
  stages: number[];
  /** The alarm and red edge tint at or below this HP fraction (§3.3). */
  alarmAt: number;
  /** Sentries (§3.5) shoot from these points (tiles), in order; `count` are present at start. */
  archers: { count: number; at: Vec2[]; attack: AttackDef };
}

/** Run-wide rules and timings (SPEC §4–§6, §10, §11). */
export interface RulesDef {
  startCoins: number;
  /** Coins per kill = enemy budget × `coinRate` × difficulty `coinIncome` (§6). */
  coinRate: number;
  countdownMs: number;
  /** Build phase cap (§10.2: 20 000 from RD3). */
  buildCapMs: number;
  /** Victory and defeat last this long before the summary (§4). */
  victoryMs: number;
  defeatMs: number;
  /** Portal flare ahead of a spawn (~1000, §9.4). */
  flareMs: number;
  /** Input older than this is neutral (§11.4: 250 ms). */
  inputStaleMs: number;
  /** Baseline knight HP (× ClassDef.hp). */
  knightHp: number;
  /** Regen (§5; RD3): 4000, 0.08, 1000. */
  regen: { delayMs: number; pct: number; everyMs: number };
  /** Quick Recovery floor (§5): 4000 solo, 5000 otherwise. */
  respawnFloorMs: { solo: number; team: number };
  /** Hot share (§9.3; RD3). */
  hot: { share: number };
  /** Respawn points at the base (§5), one per slot in order (tiles). */
  respawn: Vec2[];
  /** Bounds on summed `addPct` / `add` per stat (§15.3 caps). */
  statCaps: Partial<
    Record<StatId, { pctMin?: number; pctMax?: number; addMin?: number; addMax?: number }>
  >;
  /** Soft separation: the fraction of an overlap pushed apart per step. */
  separation: number;
  /** Knockback velocity kept per step (0..1). */
  knockbackDecay: number;
  /** Hit radius of a straight shot (bolts, sentry shots, the Wasp's stinger; tiles). */
  projectileRadius: number;
  /** Extra reach when an enemy's wound-up melee swing lands (the target may have stepped back). */
  enemySwingSlack: number;
  /** An enemy's straight shot flies this far past its target, so a moving player can step into it. */
  enemyShotSlack: number;
  /** Upgrade card offers (§6.1): cards per offer, and the chance an offer holds one rare. */
  cardOffer: { size: number; rareChance: number };
  /** Damage-over-time effects (§6.1 burn, poison): stack cap and tick interval. */
  dots: Partial<Record<EffectId, { maxStacks: number; tickEveryMs: number }>>;
  /** Wildfire and Plague: a dying enemy passes its burn or poison on this far, for this long. */
  comboSpread: { radius: number; durationMs: number };
}

/** The balance harness (§15.9; RD3). */
export interface HarnessDef {
  /** 12 grunt, 4 runner, 1 swarm, 1 brute (grouped types count groups). */
  wave: { enemy: EnemyId; count: number }[];
  portal: PortalId;
  difficulty: DifficultyId;
  seeds: number[];
  /** ±0.20 and ±0.25 of the mean clear time. */
  bands: [number, number];
  /** RD3: the wave's groups spread over this long (ms). */
  durationMs?: number;
  /** RD3: a run longer than this (ms of combat) is reported as not clearing. */
  capMs?: number;
}
