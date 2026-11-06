// The run simulation's public types (SPEC §15.3): world, entities, phases, input sources, modifiers
// and hooks, the damage pipeline, boss behaviors, commands and the run start.
// Plain TS: no Phaser, no net-client, no themes, no DOM (lint, §15.1). Units: tiles, ticks (60 Hz
// steps); config times in ms are converted to ticks at load.
// Frozen at FF1 (BUILD_PLAN §3): additive changes only (new optional fields, new union members).
// FF6 added `Unit.push` and `BaseState.stage`; FF9 added `ThrownCrate` and `World.thrown`; FF10 added
// `EnemyEnt.wander`; FF8 added `AttackState.windupAim`; FF11 added `BossAct` and the optional
// `EnemyEnt.boss` fields `act`, `ready` and `stunAt`; FF12 added `HealCalc` and `Hooks.modifyHeal`.
import type { Rng } from '@pcg/game-kit';
import type {
  EffectApply,
  ModuleRef,
  StatId,
  StatMod,
  Tile,
  TileKind,
  Vec2,
} from '../../content/types';
import type {
  CardId,
  ClassId,
  DifficultyId,
  EffectId,
  EnemyId,
  LaneId,
  PlayerColorId,
  ShopItemId,
  StructureId,
  ThemeId,
} from '../../shared/ids';
import type { AckReason, RunStats } from '../../shared/messages';
import type { SimEvent } from './events';
import type { RunSnapshot } from './snapshot';

export type { SimEvent } from './events';
export type { EffectApply, StatMod, Tile, Vec2 } from '../../content/types';

/** Steps per second (fixed-step loop, @pcg/game-kit). */
export const SIM_HZ = 60;
export const STEP_MS = 1000 / SIM_HZ;

// ---- entities -----------------------------------------------------------------------------------

/** Incrementing counter, never reused. 0 is the base (`BASE_ID`); entities start at 1. */
export type EntityId = number;
export const BASE_ID: EntityId = 0;

export interface Body {
  id: EntityId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Hitbox radius (tiles). */
  r: number;
  /** Height above the ground (tiles): flyers, arcing projectiles. */
  z?: number;
}

/** Effective stats, recomputed when mods or effects change (§6.1 stacking). */
export type StatBlock = Record<StatId, number>;

export interface StatusEffect {
  def: EffectId;
  strength: number;
  /** Ticks left. */
  remaining: number;
  stacks: number;
  source: EntityId | null;
  /** Ticks until the next `tickEveryMs` tick (damage over time). */
  nextTick?: number;
}

export interface Unit extends Body {
  hp: number;
  maxHp: number;
  /** Radians, screen-independent world angle (0 = +x, y down). */
  facing: number;
  /** Cards, passives, shop upgrades (attach order). */
  mods: Modifier[];
  /** Application order. */
  effects: StatusEffect[];
  stats: StatBlock;
  /** Knockback velocity (tiles/s), decaying each step; null or absent = none (FF6). */
  push?: Vec2 | null;
}

/** One cooldown-gated attack slot (main, super, an enemy's or structure's attack). */
export interface AttackState {
  /** Tick from which the attack can fire again. */
  readyAt: number;
  /** A release during the cooldown fires as soon as it ends (§10.1). */
  queued: boolean;
  /** Queued aim (0,0 = auto-aim). */
  aim: Vec2;
  /** Wind-up in progress: lands at this tick (null = none). */
  windupEndsAt: number | null;
  /** A player's wound-up attack lands in this direction (FF8; `aim` keeps queueing presses). */
  windupAim?: Vec2 | null;
}

export interface PlayerEnt extends Unit {
  slot: number;
  classId: ClassId;
  name: string;
  color: PlayerColorId;
  connected: boolean;
  /** Dead until `respawnAt` (tick), null when alive (§5). */
  respawnAt: number | null;
  crates: number;
  /** Emergency kits held (Quartermaster, 0 or 1). */
  kits: number;
  /** 0..1. */
  superCharge: number;
  main: AttackState;
  super: AttackState;
  /** Live aim while a button is held (TV aim line), null when not aiming. */
  mainAim: Vec2 | null;
  superAim: Vec2 | null;
  radialOpen: boolean;
  radialSlot: -1 | 0 | 1 | 2 | 3;
  /** Ticks the stick has been released (Steady Aim). */
  stillTicks: number;
  lastBuilt: StructureId | null;
  /** Build-phase ghost (§10.2). */
  ghost: StructureId | null;
  /** Commander's rally flag; persists across phases (BUILD_PLAN §8). */
  flag: Vec2 | null;
  cards: Partial<Record<CardId, number>>;
  offer: CardId[] | null;
  picked: CardId | null;
  ready: boolean;
  invincible: boolean;
  run: RunStats;
}

export interface SoldierEnt extends Unit {
  /** The Commander's slot. */
  owner: number;
  /** Position in the squad (Veterans gains are kept per index). */
  index: number;
  veterans: number;
  mode: 'follow' | 'rally';
  target: EntityId | null;
  attack: AttackState;
}

export interface EnemyEnt extends Unit {
  kind: EnemyId;
  flying: boolean;
  lane: LaneId | null;
  /** Spawn group: a Swarm pays its coins when the group's last unit dies (§9.1). */
  group: number;
  ai: 'path' | 'aggro' | 'return' | 'attack' | 'siege' | 'hunt' | 'boss';
  target: EntityId | null;
  /** Where an aggro-leash enemy left its path. */
  leashFrom: Vec2 | null;
  /** Hunter's quarry (slot). */
  hunting: number | null;
  /**
   * Hunter only (FF10-fix-1): the tick it took its current quarry (first pick or a change), which
   * drives the TV's ~2 s player-color flash at its feet. Absent for other enemies.
   */
  huntSince?: number;
  attack: AttackState;
  /**
   * Scrap-mite jitter (FF10; §15.3: in the sim, combat stream): sideways drift (−1..1), pace factor
   * (0 = a short stop) and the tick it re-rolls. Absent for other enemies.
   */
  wander?: { side: number; pace: number; until: number };
  /** Boss only: stagger meter 0..1 and Mk tier. */
  boss?: {
    mk: 1 | 2 | 3;
    stagger: number;
    staggeredUntil: number | null;
    finalPhase: boolean;
    /** FF11: the attack winding up (it lands or launches at `act.at`), null between attacks. */
    act?: BossAct | null;
    /** FF11: tick from which each of the boss's attacks may start again, by attack. */
    ready?: Record<string, number>;
    /** FF11: tick of the last stun that filled the stagger meter (one counts per lockout). */
    stunAt?: number | null;
  };
}

/**
 * A boss attack in progress (FF11, §9.2): what it is (`slam`, `breaker`, `boulder`, `call` for the
 * Colossus), when it started and lands, where it lands, what it aims at and its danger marker.
 */
export interface BossAct {
  kind: string;
  startedAt: number;
  at: number;
  x: number;
  y: number;
  target: EntityId | null;
  marker: EntityId | null;
}

/** Structures and the base are damage targets with mods (tower defense, base armor), so units. */
export interface StructureEnt extends Unit {
  kind: StructureId;
  tile: Tile;
  owner: number;
  /** False for snares (no HP, §7.1). */
  damageable: boolean;
  /** Snares: discharges left and when it rearms (tick). */
  discharges: number | null;
  rearmAt: number | null;
  /** Towers: a Fortify is attached (§8). */
  fortified: boolean;
  attack: AttackState | null;
  /** 4-bit same-type neighbor mask (walls, snares; N1 E2 S4 W8), kept for render. */
  mask: number;
}

export type DamageKind = 'melee' | 'ranged' | 'area' | 'dot' | 'contact' | 'shell';

export interface ProjectileEnt extends Body {
  side: 'ours' | 'theirs';
  source: EntityId;
  /** What fired it (render picks the frame): a class, structure, enemy or a base archer. */
  from: ClassId | StructureId | EnemyId | 'archer';
  slot: 'main' | 'super' | 'attack';
  damage: number;
  kind: DamageKind;
  tags: readonly string[];
  effects: EffectApply[];
  hitsFlyers: boolean;
  blockedBy: readonly ('wall' | 'tower')[];
  /** Enemies it can still pass through (Piercing Shot). */
  pierce: number;
  hit: EntityId[];
  expiresAt: number;
  /** Arcing shells: launch and landing point and ticks; null for straight shots. */
  arc: { from: Vec2; to: Vec2; launchedAt: number; landsAt: number; radius: number } | null;
}

export interface CratePile {
  id: EntityId;
  x: number;
  y: number;
  n: number;
  /** The slot that dropped it can't pick it back up until `lockedUntil` (§10.1, ~1 s). */
  lockedSlot: number | null;
  lockedUntil: number;
}

/**
 * A crate a Quartermaster threw (§6, §10.1 row 6; FF9). It flies from the launch point to the
 * receiver, following them, and lands at `landsAt`: caught if they're still up with room, otherwise
 * dropped where it lands.
 */
export interface ThrownCrate {
  id: EntityId;
  /** Thrower's and receiver's slots. */
  from: number;
  to: number;
  /** Launch point (tiles). */
  x0: number;
  y0: number;
  /** Landing point: the receiver's position, followed each step in flight. */
  x: number;
  y: number;
  launchedAt: number;
  landsAt: number;
}

/** A telegraphed attack (boss wind-ups): shape, position, when it lands, what it does (§9.2). */
export interface DangerMarker {
  id: EntityId;
  source: EntityId;
  shape: 'circle' | 'arc' | 'ring';
  x: number;
  y: number;
  r: number;
  /** Arc direction (radians) and width; ring inner radius. */
  angle?: number;
  arcDeg?: number;
  inner?: number;
  createdAt: number;
  landsAt: number;
  payload: {
    damage: number;
    kind: DamageKind;
    tags: readonly string[];
    hitsStructures: boolean;
    effects?: EffectApply[];
  };
}

// ---- world --------------------------------------------------------------------------------------

export type Phase = 'countdown' | 'build' | 'combat' | 'victory' | 'defeat' | 'summary';

/** Map tiles, index = row × cols + col. */
export interface TileGrid {
  cols: number;
  rows: number;
  kinds: readonly TileKind[];
  /** Structure on each tile (EntityId), 0 = none. */
  occupant: Int32Array;
}

/** SPEC §15.5. `next` is the tile index to step to; −1 = goal. */
export interface FlowField {
  cols: number;
  rows: number;
  dist: Float32Array;
  next: Int16Array;
}

export interface FlowFields {
  ground: FlowField;
  breaker: FlowField;
  /** One per hunted player, by slot (null = not hunted). */
  hunted: (FlowField | null)[];
  /** Set when a blocking structure is placed or destroyed; rebuilt the same step. */
  dirty: boolean;
}

/** Uniform grid for "who's near me" queries; rebuilt each step, not part of the state hash. */
export interface SpatialHash {
  readonly cellSize: number;
  clear(): void;
  insert(id: EntityId, x: number, y: number, r: number): void;
  /** Ids whose circles touch (x, y, r), ascending, into `out`. */
  query(x: number, y: number, r: number, out: EntityId[]): EntityId[];
  /**
   * FF10-fix-2: ids whose circles' boxes touch the box x0..x1 × y0..y1, ascending, into `out` (body
   * hitboxes reach up the screen from the feet, so hit tests look further south than north).
   */
  queryBox(x0: number, y0: number, x1: number, y1: number, out: EntityId[]): EntityId[];
}

export interface BaseState extends Unit {
  /** Shop repairs bought (price rises per purchase, §3.4). */
  repairs: number;
  alarm: boolean;
  archers: { count: number; attack: AttackState[]; aim: number[] };
  /** Visual damage stage (§3.3): 0 none, 1 cracks, 2 fire, 3 heavy smoke (FF6; always set by the sim). */
  stage?: 0 | 1 | 2 | 3;
}

export interface TeamState {
  coins: number;
  /** Tier owned per shop item (archer upgrades: 0 or 1 each). */
  shop: Record<ShopItemId, number>;
  wishlist: { item: ShopItemId; slot: number }[];
  /** Fixed at each wave start from the players connected then (§9.4, §11.3). */
  scaling: { players: number; mult: number; flyers: boolean };
}

/** A wave group still to spawn. */
export interface PendingSpawn {
  atTick: number;
  lane: LaneId;
  enemy: EnemyId;
  count: number;
  warned: boolean;
}

export interface RunSettings {
  theme: ThemeId;
  difficulty: DifficultyId;
}

export interface World {
  tick: number;
  phase: Phase;
  wave: number;
  /** When the current phase's timer runs out (tick), null = no timer. */
  phaseEndsAt: number | null;
  seed: number;
  settings: RunSettings;
  nextId: EntityId;
  players: PlayerEnt[];
  soldiers: SoldierEnt[];
  enemies: EnemyEnt[];
  structures: StructureEnt[];
  projectiles: ProjectileEnt[];
  cratePiles: CratePile[];
  /** Crates in flight (FF9; the sim always sets it). */
  thrown?: ThrownCrate[];
  /** Telegraphs: shape, position, landsAt, payload. */
  markers: DangerMarker[];
  spawns: PendingSpawn[];
  grid: TileGrid;
  fields: FlowFields;
  spatial: SpatialHash;
  base: BaseState;
  /** Coins, shop tiers, wishlist, scaling. */
  team: TeamState;
  /** Cleared each step; render, audio and phones read them. */
  events: SimEvent[];
}

// ---- input --------------------------------------------------------------------------------------

/** What a character reads each step (SPEC §15.3). Counters only grow; the sim diffs them. */
export interface PlayerInput {
  /** −1..1. */
  move: Vec2;
  /** −1..1; aim 0,0 on a fire = auto-aim. */
  mainAim: Vec2;
  superAim: Vec2;
  mainAiming: boolean;
  superAiming: boolean;
  radialOpen: boolean;
  /** Left, up, right, down (Give). */
  radialSlot: -1 | 0 | 1 | 2 | 3;
  mainFires: number;
  superFires: number;
  actionTaps: number;
  radialCommits: number;
}

/** PhoneInputSource (§15.6 staleness), AutopilotInputSource, ReplayInputSource (§15.9). */
export interface InputSource {
  sample(tick: number): PlayerInput;
}

// ---- modifiers, hooks, damage -------------------------------------------------------------------

/** Services a module or system may use during a step. */
export interface SimCtx {
  readonly world: World;
  /** Seeded stream for (run seed, label), e.g. `combat:<wave>` (§15.3). */
  rng(label: string): Rng;
  emit(event: SimEvent): void;
  damage(calc: DamageCalc): DamageResult;
  heal(target: EntityId, amount: number, source: EntityId | null): HealResult;
  /** Runs `beforeEffect` hooks, then the stacking policy; false = refused (immune). */
  applyEffect(target: EntityId, effect: EffectApply, source: EntityId | null): boolean;
  /** Any unit by id (players, soldiers, enemies, structures, the base), or null if gone. */
  unit(id: EntityId): Unit | null;
}

/** An attack about to fire; `onAttack` hooks may change it (Volley, Piercing Shot). */
export interface AttackEvent {
  attacker: EntityId;
  slot: 'main' | 'super' | 'attack';
  /** Unit direction, or 0,0 for auto-aim. */
  aim: Vec2;
  count: number;
  spreadDeg: number;
  pierce: number;
  effects: EffectApply[];
  tags: string[];
}

/** One hit, through `applyDamage` (§15.3). Hooks mutate `amount` and `tags`. */
export interface DamageCalc {
  source: EntityId | null;
  target: EntityId;
  amount: number;
  kind: DamageKind;
  tags: string[];
}

export interface DamageResult {
  source: EntityId | null;
  target: EntityId;
  kind: DamageKind;
  tags: readonly string[];
  /** After modifiers, before shields. */
  amount: number;
  /** Taken by shields (Overflow). */
  absorbed: number;
  /** Taken from HP. */
  dealt: number;
  killed: boolean;
}

export interface HealResult {
  source: EntityId | null;
  target: EntityId;
  amount: number;
  healed: number;
  /** Beyond full HP (Overflow turns it into a shield). */
  overflow: number;
}

/** A heal about to land (FF12): the healer's `modifyHeal` hooks may change `amount` (Triage). */
export interface HealCalc {
  source: EntityId | null;
  target: EntityId;
  amount: number;
}

/** An effect about to be applied (`beforeEffect` may refuse it). */
export interface EffectApplyEvent extends EffectApply {
  source: EntityId | null;
  target: EntityId;
}

export interface Hooks {
  onTick(ctx: SimCtx, self: Unit): void;
  onAttack(ctx: SimCtx, self: Unit, atk: AttackEvent): void; // Volley, Piercing Shot
  modifyOutgoing(ctx: SimCtx, self: Unit, d: DamageCalc): void; // pipeline stage 2
  modifyIncoming(ctx: SimCtx, self: Unit, d: DamageCalc): void; // pipeline stage 4
  beforeEffect(ctx: SimCtx, self: Unit, e: EffectApplyEvent): boolean; // false = immune
  onDamageDealt(ctx: SimCtx, self: Unit, r: DamageResult): void;
  onDamageTaken(ctx: SimCtx, self: Unit, r: DamageResult): void;
  onHeal(ctx: SimCtx, self: Unit, h: HealResult): void; // Overflow, super charge
  onKill(ctx: SimCtx, self: Unit, victim: Unit): void;
  onDeath(ctx: SimCtx, self: Unit, killer: Unit | null): void; // Wildfire, Plague
  onPhase(ctx: SimCtx, self: Unit, phase: Phase): void; // Veterans
  /** FF12: before a heal this unit gives lands (Triage doubles it on players below 30% HP). */
  modifyHeal(ctx: SimCtx, self: Unit, h: HealCalc): void;
}

/** Passives, cards, status effects, auras and boss behaviors share this shape (§15.3). */
export interface Modifier {
  /** 'card:fire_arrows', 'passive:mason', 'effect:burn'. */
  id: string;
  stats?: StatMod[];
  hooks?: Partial<Hooks>;
}

/** A module registered by id and built from config params (`ModuleRef`). */
export interface ModuleDef<P = Record<string, number | string | boolean>> {
  id: string;
  make(params: P): Modifier;
}

export type { ModuleRef };

/** Status effect definition (§15.3). */
export interface EffectDef {
  id: EffectId;
  stacking: 'refresh' | 'strongest' | 'stack';
  /** Unused since the balance pass: content's `RulesDef.dots` gives the stack cap and tick (frozen). */
  maxStacks?: number;
  tickEveryMs?: number;
  modifier(strength: number): Modifier;
}

/** Boss behaviors are modules, so new bosses don't touch the Colossus (§15.3). */
export interface BossBehavior {
  /** 'colossus'. */
  id: string;
  init(ctx: SimCtx, boss: EnemyEnt, variant: { wave: number; mk: 1 | 2 | 3 }): void;
  /** Picks attacks, emits DangerMarkers with wind-ups. */
  tick(ctx: SimCtx, boss: EnemyEnt): void;
  /** Stagger meter. */
  onDamage?(ctx: SimCtx, boss: EnemyEnt, r: DamageResult): void;
}

// ---- commands and run start ---------------------------------------------------------------------

/**
 * Everything that changes run state other than input samples (§15.3). Applied at the start of a step
 * in logged order, so replays are exact. `ref` tags the command for its intent's `ack` (the sim
 * answers with a `command` event); replays keep it.
 */
export type SimCommand = (
  | { c: 'presence'; slot: number; connected: boolean }
  /** Late join at a build phase (§11.2). */
  | {
      c: 'join';
      slot: number;
      name: string;
      color: PlayerColorId;
      classId: ClassId;
    }
  | { c: 'ready'; slot: number; ready: boolean }
  | { c: 'build'; slot: number; action: 'select'; structure: StructureId }
  | { c: 'build'; slot: number; action: 'place' | 'cancel' }
  | { c: 'buy'; slot: number; item: ShopItemId }
  | { c: 'request'; slot: number; item: ShopItemId; on: boolean }
  | { c: 'card'; slot: number; card: CardId }
  | { c: 'give'; slot: number }
  /** Debug panel (§9.5), dev only. `slot` −1 = the TV. */
  | { c: 'debug'; slot: number; action: 'jumpWave'; wave: number }
  | { c: 'debug'; slot: number; action: 'spawn'; enemy: EnemyId; lane: LaneId }
  | { c: 'debug'; slot: number; action: 'invincible'; on: boolean }
  | { c: 'debug'; slot: number; action: 'coins'; amount: number }
) & { ref?: number };

export type SimCommandKind = SimCommand['c'];

/** Command refusal reasons are the intent ack reasons. */
export type CommandReason = AckReason;

/** One player slot at run start (party → sim). */
export interface RunSlot {
  slot: number;
  name: string;
  color: PlayerColorId;
  classId: ClassId;
  connected: boolean;
}

/** A run starts from this (§15.3); a resume adds the snapshot it restores (§15.8). */
export interface RunStart {
  seed: number;
  settings: RunSettings;
  slots: RunSlot[];
  snapshot?: RunSnapshot;
}
