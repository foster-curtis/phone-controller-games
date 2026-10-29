// Gameplay config types (SPEC §15.4). Content files in src/content/ are TS data typed with
// `satisfies` against these. Units: distances in tiles, speeds in tiles/s, times in ms (the sim
// converts to steps at load), damage and HP as plain numbers. Presentation never lives here (§2.1).
// Frozen at FF1 (BUILD_PLAN §3): additive changes only. Tuning values in src/content/ are not frozen.
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
  shape: 'projectile' | 'arc' | 'cone' | 'circle';
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
  super: AttackDef & { effects?: EffectApply[]; heal?: number };
  /** §10.1 table. */
  input: { main: 'aimed' | 'tap'; super: 'aimed' | 'tap' };
  superChargeRate: number;
  passive: ModuleRef;
  /** Arc order: left, up, right (at most 3, the build arc). */
  build: StructureId[];
  carryCap: number;
  /** Speed multiplier lost per crate count (index = crates carried). */
  carrySlowdown: number[];
  /** `size` per stage (start, after wave 5 boss, after wave 10 boss). */
  squad?: { size: number[]; soldier: UnitStats; followRadius: number };
}

export interface EnemyDef {
  id: EnemyId;
  hp: number;
  speed: number;
  radius: number;
  flying: boolean;
  budget: number;
  groupSize?: number;
  ai: 'path' | 'runner' | 'siege' | 'hunter' | 'flyer' | 'boss';
  field: 'ground' | 'breaker' | 'none';
  attack: AttackDef;
  /** Damage multipliers vs structures (Brute 2× walls, Colossus 3×). */
  vsStructure?: Partial<Record<StructureId | 'base', number>>;
  aggro?: { radius: number; leash: number };
  slowResist?: number;
  boss?: ModuleRef;
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
