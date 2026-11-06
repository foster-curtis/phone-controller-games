// Gameplay config types (SPEC §15.4). Content files in src/content/ are TS data typed with
// `satisfies` against these. Units: distances in tiles, speeds in tiles/s, times in ms (the sim
// converts to steps at load), damage and HP as plain numbers. Presentation never lives here (§2.1).
// Frozen at FF1 (BUILD_PLAN §3): additive changes only. Tuning values in src/content/ are not frozen.
// FF6 added `BaseDef` and `RulesDef`. FF9 added the `buff` shape, `CharacterDef.super.selfEffects` and
// `CharacterDef.supply`. FF10 added the `swarm` and `brute` AI kinds. FF8 added `StructureDef.defense`.
// The balance pass moved the sim's own tuning numbers here: `AttackDef.minFlightMs`, the squad's
// `aggro`/`hurry`/`formation`, `supply.throwMinFlightMs`, `EnemyDef.hunt`/`jitter`,
// `StructureDef.triggerFraction` and the `RulesDef` fields from `projectileRadius` on.
import type {
  CardId,
  ClassId,
  DifficultyId,
  EffectId,
  EnemyId,
  LaneId,
  ShopItemId,
  StructureId,
} from '../shared/ids';

// ---- geometry -----------------------------------------------------------------------------------

/** World position or direction, in tiles (−1..1 for input directions). */
export interface Vec2 {
  x: number;
  y: number;
}

/** A grid tile: [col, row], row 0 at the top (the Citadel's edge). */
export type Tile = readonly [col: number, row: number];

/** What a map tile is (placement rules, SPEC §7). Only `open` is buildable. */
export type TileKind = 'open' | 'blocked' | 'citadel' | 'repair' | 'armory' | 'lane';

// ---- stats and modules --------------------------------------------------------------------------

/**
 * Stats a modifier can change (SPEC §6.1, §15.3). `value = base × (1 + clamp(Σ addPct, min, cap)) + Σ add`.
 * Append-only.
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
  'crateDiscount',
  'carrySlowdown',
  'auraRadius',
  'repairRate',
] as const;
export type StatId = (typeof STAT_IDS)[number];

/** One stat change. `addPct` is a fraction (+10% = 0.1); `add` is in the stat's own unit. */
export interface StatMod {
  stat: StatId;
  addPct?: number;
  add?: number;
  /** Which attack the change applies to; omitted = the whole unit. */
  scope?: 'main' | 'super' | 'passive';
}

/** A module (passive, card behavior, boss) by registry id, built from config params (§15.3). */
export type ModuleRef = { module: string; params?: Record<string, number | string | boolean> };

/** A status effect an attack or structure applies (§6.1, §15.3). */
export interface EffectApply {
  effect: EffectId;
  /** Effect-specific: slow fraction, damage per tick, stun has none (1). */
  strength: number;
  durationMs: number;
}

// ---- attacks and units --------------------------------------------------------------------------

export interface AttackDef {
  /**
   * `buff` (FF9) hits nothing: the super's `effects` go on the attacker and its squad, and its
   * `selfEffects` on the attacker only (the Commander's morale).
   */
  shape: 'projectile' | 'arc' | 'cone' | 'circle' | 'buff';
  damage: number;
  range: number;
  cooldownMs: number;
  windupMs?: number;
  arcDeg?: number;
  count?: number;
  spreadDeg?: number;
  speed?: number;
  hitsFlyers: boolean;
  blockedBy?: ('wall' | 'tower')[];
  knockback?: number;
  /** Area radius for `circle` attacks and shells landing (tiles). */
  radius?: number;
  /** Lobbed shells (Bombard, mortar): the shortest flight, so a close lob still arcs (ms). */
  minFlightMs?: number;
}

/** Plain unit stats (Commander's soldiers). */
export interface UnitStats {
  hp: number;
  moveSpeed: number;
  radius: number;
  attack: AttackDef;
}

export interface CharacterDef {
  id: ClassId;
  hp: number;
  moveSpeed: number;
  radius: number;
  main: AttackDef;
  /**
   * `effects` go to what the super helps: towers in a cone (Quartermaster), the squad and the
   * attacker for `buff` (Commander); `heal` heals players in a cone; `selfEffects` (FF9) go on the
   * attacker only.
   */
  super: AttackDef & { effects?: EffectApply[]; heal?: number; selfEffects?: EffectApply[] };
  /** §10.1 table. */
  input: { main: 'aimed' | 'tap'; super: 'aimed' | 'tap' };
  superChargeRate: number;
  passive: ModuleRef;
  /** Arc order: left, up, right (at most 3, the build arc). */
  build: StructureId[];
  carryCap: number;
  /** Speed multiplier lost per crate count (index = crates carried). */
  carrySlowdown: number[];
  /**
   * `size` per stage (start, after wave 5 boss, after wave 10 boss). `aggro`: a soldier engages
   * enemies within `radius` and never chases past `leash` from its post. `hurry`: further than `at`
   * from its slot it walks at `factor` × speed. `formation`: slot radius round a planted flag, and the
   * spread between follow slots (radians).
   */
  squad?: {
    size: number[];
    soldier: UnitStats;
    followRadius: number;
    aggro?: { radius: number; leash: number };
    hurry?: { at: number; factor: number };
    formation?: { flagRing: number; followSpread: number };
  };
  /**
   * Supply perks (§6, Quartermaster; FF9): crate price discount (fraction), crate throw reach
   * (tiles) and flight speed (tiles/s), and the HP an emergency repair kit restores (§3.4).
   * `throwMinFlightMs`: a throw is never shorter than this (a lob, even point-blank).
   */
  supply?: {
    crateDiscount: number;
    throwRange: number;
    throwSpeed: number;
    kitRepair: number;
    throwMinFlightMs?: number;
  };
}

export interface EnemyDef {
  id: EnemyId;
  hp: number;
  speed: number;
  radius: number;
  flying: boolean;
  budget: number;
  groupSize?: number;
  /** FF10 added `swarm` (path with in-sim jitter) and `brute` (path that smashes walls it meets). */
  ai: 'path' | 'runner' | 'siege' | 'hunter' | 'flyer' | 'boss' | 'swarm' | 'brute';
  field: 'ground' | 'breaker' | 'none';
  attack: AttackDef;
  /** Damage multipliers vs structures (Brute 2× walls, Colossus 3×). */
  vsStructure?: Partial<Record<StructureId | 'base', number>>;
  aggro?: { radius: number; leash: number };
  /** Fraction of any slow resisted: Brutes and the Colossus take slows at half strength (0.5, §7.1). */
  slowResist?: number;
  boss?: ModuleRef;
  /**
   * Hunter (§9, C3): within `closeRange` it runs straight at its quarry; another player must be
   * `retargetTiles` closer to take over. Its field adds `threatCost` per tower or sentry covering a
   * tile, a tile counting as covered within the attacker's range + `threatPad`.
   */
  hunt?: { closeRange: number; retargetTiles: number; threatCost: number; threatPad: number };
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
   * The body our attacks hit (C4, FF10-fix-2; SPEC §9, §15.3): the drawn torso, head and legs (arms,
   * tails, rotors and barrels left out), in tiles of drawn height above the ground point, from
   * `bottom` (0 on the ground; the Wasp's flight height) to `top`; `radius` is half its width. The
   * sim sweeps a circle of `radius` up the screen over that span (`sim/body.ts`). Every enemy has one.
   */
  body?: { radius: number; bottom: number; top: number };
}

export interface StructureDef {
  id: StructureId;
  cost: number;
  /** null = can't be damaged (snare, §7.1). */
  hp: number | null;
  pathCost: number;
  blocksProjectiles: boolean;
  attack?: AttackDef;
  attachesTo?: StructureId[];
  /** Snare (§7.1). */
  discharges?: number;
  rearmMs?: number;
  slow?: EffectApply;
  /** Fortify (§8, FF8): damage reduction (0..1) the tower it attaches to gains. */
  defense?: number;
  /** Snare: an enemy sets it off when this fraction of its body radius overlaps the tile. */
  triggerFraction?: number;
}

// ---- cards and shop -----------------------------------------------------------------------------

export interface CardDef {
  id: CardId;
  owner: ClassId | 'common';
  tier: 'common' | 'rare' | 'combo';
  unique?: boolean;
  requires?: [CardId, CardId];
  favoredEnemy?: EnemyId;
  requiresClass?: ClassId;
  stats?: StatMod[];
  module?: ModuleRef;
  /** Shared commons: numbers tuned per class. */
  perClass?: Partial<Record<ClassId, StatMod[]>>;
}

/** What a shop upgrade changes. */
export type UpgradeTarget = 'base' | 'archers' | 'squad' | 'towers' | StructureId;

/** One shop tier's effect (SPEC §6.2). */
export type UpgradeEffect =
  | { kind: 'crates'; count: number }
  | { kind: 'repair'; hp: number }
  | { kind: 'kit' }
  | { kind: 'stats'; target: UpgradeTarget; stats: StatMod[] }
  | { kind: 'archers'; add: number }
  | { kind: 'discharges'; add: number }
  | { kind: 'module'; target: UpgradeTarget; module: ModuleRef };

/** When a shop item is shown (§6.2: only when the team can use it). */
export type Condition = { teamHasAny: ClassId[] } | { waveAtLeast: number };

export interface ShopItemDef {
  id: ShopItemId;
  tiers: { price: number; effect: UpgradeEffect }[];
  visibleIf?: Condition;
  qmOnly?: boolean;
  afterRegularWaveOnly?: boolean;
  holdToConfirm?: boolean;
  /** Crates, repair: bought again and again (repair's price still rises per purchase). */
  repeatable?: boolean;
}

// ---- waves, difficulty, map ---------------------------------------------------------------------

export interface WaveDef {
  n: number;
  budget: number;
  allowed: EnemyId[];
  lanes: LaneId[];
  guaranteed: { enemy: EnemyId; count: number; lane?: LaneId }[];
  durationMs: number;
  boss?: { id: EnemyId; mk: 1 | 2 | 3 };
}

export interface DifficultyDef {
  id: DifficultyId;
  budget: number;
  enemyHp: number;
  enemyDamage: number;
  baseHp: number;
  coinIncome: number;
}

/** Player-count scaling: `base + perPlayer × players` (§9.4). */
export interface ScalingDef {
  base: number;
  perPlayer: number;
}

export interface MapDef {
  id: string;
  cols: number;
  rows: number;
  /** ASCII rows, top to bottom, one char per tile. */
  tiles: string[];
  legend: Record<string, TileKind>;
  lanes: Record<LaneId, { entry: Tile[]; spawn: Vec2 }>;
}

// ---- base and run rules (FF6, additive) ---------------------------------------------------------

/** The Citadel (SPEC §3.3–§3.5). */
export interface BaseDef {
  hp: number;
  /** HP one delivered crate restores (§3.4). */
  repairPerCrate: number;
  /** Visual damage stages (§3.3), descending HP fractions: cracks, fire, heavy smoke. */
  stages: number[];
  /** The alarm and red edge tint at or below this HP fraction (§3.3). */
  alarmAt: number;
  /** Base archers (§3.5) shoot from these points (tiles), in order; `count` are present at start. */
  archers: { count: number; at: Vec2[]; attack: AttackDef };
}

/** Run-wide rules and timings that aren't per class, enemy or structure (SPEC §4–§6, §10, §11). */
export interface RulesDef {
  startCoins: number;
  countdownMs: number;
  /** Build phase cap (§10.2: 45 s). */
  buildCapMs: number;
  /** Death to respawn at the base (§5: 10 s). */
  respawnMs: number;
  /** Victory and defeat last this long before the summary (§4). */
  victoryMs: number;
  defeatMs: number;
  /** Lane glow ahead of a group's spawn (§9.4: ~3 s). */
  spawnWarningMs: number;
  /** Input older than this is neutral (§11.4: 250 ms). */
  inputStaleMs: number;
  /** A dropped crate can't be picked back up by its dropper for this long (§10.1: ~1 s). */
  dropLockMs: number;
  /** Reach for picking up a crate pile and for giving a crate to a teammate (tiles). */
  pickupRadius: number;
  giveRadius: number;
  /** Respawn points at the base (§5), one per slot in order (tiles). */
  respawn: Vec2[];
  /** Bounds on summed `addPct` / `add` per stat (§15.3 caps). */
  statCaps: Partial<
    Record<StatId, { pctMin?: number; pctMax?: number; addMin?: number; addMax?: number }>
  >;
  /** Breaker field (§15.5): what a wall tile costs a Brute or the Colossus. */
  breakerWallCost: number;
  /** Soft separation: the fraction of an overlap pushed apart per step. */
  separation: number;
  /** Knockback velocity kept per step (0..1). */
  knockbackDecay: number;
  /** Hit radius of a straight shot (bolts, turret and sentry shots, the Wasp's stinger; tiles). */
  projectileRadius: number;
  /** Extra reach when an enemy's wound-up melee swing lands (the target may have stepped back). */
  enemySwingSlack: number;
  /** An enemy's straight shot flies this far past its target, so a moving player can step into it. */
  enemyShotSlack: number;
  /** Fortify reaches a tower whose tile is this close to the builder's center (tiles). */
  fortifyReach: number;
  /** Upgrade card offers (§6.1): cards per offer, and the chance an offer holds one rare. */
  cardOffer: { size: number; rareChance: number };
  /** Damage-over-time effects (§6.1 burn, poison): stack cap and tick interval. */
  dots: Partial<Record<EffectId, { maxStacks: number; tickEveryMs: number }>>;
  /** Wildfire and Plague: a dying enemy passes its burn or poison on this far, for this long. */
  comboSpread: { radius: number; durationMs: number };
}
