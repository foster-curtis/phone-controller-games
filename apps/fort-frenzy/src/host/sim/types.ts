// The run simulation's public types (SPEC §15.3): world, entities, phases, input sources, modifiers
// and hooks, the damage pipeline, boss behaviors, commands and the run start.
// Plain TS: no Phaser, no net-client, no presentation, no DOM (lint, §15.1). Units: tiles, ticks (60 Hz
// steps); config times in ms are converted to ticks at load.
// Frozen after RD2 (REDESIGN_BUILD_PLAN §3): additive changes only (new optional fields, new union
// members). RD2 implemented the v2 shapes (SPEC §15.3): builds and flights, the meter, regen and
// growth state, portals on enemies and spawns, the player-count scaling, input v2; the structures,
// the supply system, the wall-smashing field and `TileGrid.occupant` are gone.
import type { Rng } from '@pcg/game-kit';
import type { EffectApply, ModuleRef, StatId, StatMod, TileKind, Vec2 } from '../../content/types';
import type {
  BuildId,
  CardId,
  ClassId,
  DifficultyId,
  EffectId,
  EnemyId,
  KnightId,
  PlayerColorId,
  PortalId,
  ShopItemId,
  SideId,
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

/** One cooldown-gated attack slot (main, super, build, an enemy's attack). */
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
  /**
   * A player's held aim (FF7-fix-4, FF7-fix-5): `out` while it is outside the dead zone, `cancelled`
   * while it is back inside (a release would cancel; the aim line hides until the thumb drags out
   * again), null when not held.
   */
  held?: 'out' | 'cancelled' | null;
}

/** A nanite blast in progress (§8.2, RD8): what one release's remaining shots need. */
export interface NaniteBurst {
  /** The aim he released with, radians: the blast doesn't follow a later turn. */
  angle: number;
  startedAt: number;
  fired: number;
  count: number;
  /** Steps from the first shot to the last. */
  steps: number;
  halfSpread: number;
  minReach: number;
  damage: number;
  range: number;
  speed: number;
  pierce: number;
  tags: string[];
  effects: EffectApply[];
}

export interface PlayerEnt extends Unit {
  slot: number;
  classId: ClassId;
  name: string;
  color: PlayerColorId;
  connected: boolean;
  /** Dead until `respawnAt` (tick), null when alive (§5). */
  respawnAt: number | null;
  /** 0..1. */
  superCharge: number;
  main: AttackState;
  super: AttackState;
  /** The Artificer's blast still firing (null otherwise); never outlives combat, so never saved. */
  burst: NaniteBurst | null;
  /** Build meter 0..1 (§7.2); starts the run full (RD3). */
  meter: number;
  /** The build button: queued press, aim, held (§10.1). */
  build: AttackState;
  /** Live aim while a button is held (TV aim line), null when not aiming. */
  mainAim: Vec2 | null;
  superAim: Vec2 | null;
  /** Live aim while a thrown build is held (TV preview). */
  buildAim: Vec2 | null;
  /** Regen (§5): none before `quietUntil` (5 s after the last damage, main or super); next tick at `nextRegen`. */
  regen: { quietUntil: number; nextRegen: number };
  /** Class growth bumps received (§6.1). */
  growth: { regular: number; boss: number };
  /** Ticks the stick has been released (Steady Aim). */
  stillTicks: number;
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
  /** Thrown by Reinforcements; joins on landing (RD9). */
  flight: Flight | null;
}

/** A thrown build or soldier in the air (§7.3): it lands at `to` on `landsAt`. */
export interface Flight {
  from: Vec2;
  to: Vec2;
  launchedAt: number;
  landsAt: number;
}

/** A placed build (§7). A Unit so it takes damage through `applyDamage` and carries card mods. */
export interface BuildEnt extends Unit {
  kind: BuildId;
  /** The knight's slot. */
  owner: number;
  /** Placement order per owner (the oldest mine goes first). */
  seq: number;
  /** A destroyed build is removed (event `buildGone`). */
  state: 'flight' | 'landed' | 'active';
  flight: Flight | null;
  /** HP builds (BuildDef.traits.targetable). */
  targetable: boolean;
  /** Mines; null for HP builds and the flag. */
  charges: number | null;
  /** Tick it starts working (landing + switch-on, mine arming). */
  liveAt: number;
  /** Mines: a ground enemy set it off; bursts at this tick. */
  triggerAt: number | null;
  /** Beacon: next heal pulse tick. */
  nextPulse: number | null;
}

export interface EnemyEnt extends Unit {
  kind: EnemyId;
  flying: boolean;
  /** Where it spawned (was `lane`); null for debug and tooling spawns. */
  portal: PortalId | null;
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
 * A boss attack in progress (FF11, §9.2): what it is (`slam`, `boulder`, `charge` (RD10), `call` for
 * the Colossus), when it started and lands, where it lands, what it aims at and its danger marker.
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

export type DamageKind = 'melee' | 'ranged' | 'area' | 'dot' | 'contact' | 'shell';

export interface ProjectileEnt extends Body {
  side: 'ours' | 'theirs';
  source: EntityId;
  /** What fired it (render picks the frame): a knight, build, enemy or a sentry. */
  from: KnightId | EnemyId | BuildId | 'archer';
  slot: 'main' | 'super' | 'attack';
  damage: number;
  kind: DamageKind;
  tags: readonly string[];
  effects: EffectApply[];
  hitsFlyers: boolean;
  /** Enemies it can still pass through (Piercing Shot). */
  pierce: number;
  hit: EntityId[];
  expiresAt: number;
  /** Arcing shells: launch and landing point and ticks; null for straight shots. */
  arc: { from: Vec2; to: Vec2; launchedAt: number; landsAt: number; radius: number } | null;
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
    /** HP builds and the Citadel inside it are hit too. */
    hitsBuilds: boolean;
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
}

/** SPEC §15.5. `next` is the tile index to step to; −1 = goal. */
export interface FlowField {
  cols: number;
  rows: number;
  dist: Float32Array;
  next: Int16Array;
}

export interface FlowFields {
  /** Built once per run (no rebuilds, §15.5). */
  ground: FlowField;
  /** One per hunted player, by slot (null = not hunted). */
  hunted: (FlowField | null)[];
  /** Per targeted build, keyed by its tile index (§15.5; RD10). */
  brute: Record<number, FlowField>;
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
  scaling: {
    players: number;
    budget: number;
    bossHp: number;
    respawnMs: number;
    /** Portals used per spawn pulse, `min(players + 1, 6)` (RD3). */
    activeCap: number;
    flyers: boolean;
  };
}

/** A wave group still to spawn. */
export interface PendingSpawn {
  atTick: number;
  portal: PortalId;
  enemy: EnemyId;
  count: number;
  /** The hot side at this pulse (debug only; null before RD3). */
  hot: SideId | null;
  /** Portal flare sent (§9.4, `rules.flareMs` ahead). */
  flared: boolean;
}

export interface RunSettings {
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
  /** Placed and thrown builds (§7; RD3 places them). */
  builds: BuildEnt[];
  projectiles: ProjectileEnt[];
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
  buildAim: Vec2;
  mainAiming: boolean;
  superAiming: boolean;
  buildAiming: boolean;
  /** Press counters. */
  mainFires: number;
  superFires: number;
  buildFires: number;
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
  /** Any unit by id (players, soldiers, enemies, builds, the base), or null if gone. */
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
  /** 'card:fire_arrows', 'passive:steady_aim', 'effect:burn', 'build:shield_gen'. */
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
  | { c: 'buy'; slot: number; item: ShopItemId }
  | { c: 'request'; slot: number; item: ShopItemId; on: boolean }
  | { c: 'card'; slot: number; card: CardId }
  /** Debug panel (§9.5), dev only. `slot` −1 = the TV. */
  | { c: 'debug'; slot: number; action: 'jumpWave'; wave: number }
  | { c: 'debug'; slot: number; action: 'spawn'; enemy: EnemyId; portal: PortalId }
  | { c: 'debug'; slot: number; action: 'invincible'; on: boolean }
  | { c: 'debug'; slot: number; action: 'coins'; amount: number }
  /** Fill every knight's build meter, or only `target`'s (a run slot; RD6). */
  | { c: 'debug'; slot: number; action: 'meter'; target?: number }
  /**
   * Force the hot side (RD6): the unflared spawn plan's hot-side groups move to `side`'s portals, and
   * every later wave's plan too, until `side` null clears it.
   */
  | { c: 'debug'; slot: number; action: 'hot'; side: SideId | null }
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
