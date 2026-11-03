// The sim's internal step context: `SimCtx` plus the lookups and helpers the step's systems and the
// registered behaviors share (SPEC §15.3). Types only, so behaviors can import it without a cycle
// through the registry.
import type { AttackDef, StatId, TileKind } from '../../content/types';
import type { ClassId, EnemyId, StructureId } from '../../shared/ids';
import type { Catalog } from './catalog';
import type {
  DamageKind,
  EffectApply,
  EnemyEnt,
  EntityId,
  FlowField,
  Hooks,
  Modifier,
  PlayerEnt,
  PlayerInput,
  ProjectileEnt,
  SimCtx,
  StructureEnt,
  Unit,
  World,
} from './types';

export type UnitKind = 'player' | 'soldier' | 'enemy' | 'structure' | 'base';

/** This step's input for one slot, after counter diffing (§15.3 step 2). */
export interface SlotInput {
  input: PlayerInput;
  main: boolean;
  super: boolean;
  action: boolean;
  radial: boolean;
  /** Counters seen last; `baseline` = the next sample only re-baselines (connect, start). */
  prev: { mainFires: number; superFires: number; actionTaps: number; radialCommits: number };
  baseline: boolean;
}

export interface FireSpec {
  source: Unit;
  from: ProjectileEnt['from'];
  slot: ProjectileEnt['slot'];
  side: ProjectileEnt['side'];
  x: number;
  y: number;
  /** Unit direction. */
  dx: number;
  dy: number;
  attack: AttackDef;
  damage: number;
  range: number;
  speed: number;
  kind: DamageKind;
  tags: readonly string[];
  effects: EffectApply[];
  pierce: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SimState extends SimCtx {
  readonly world: World;
  readonly cat: Catalog;
  /** Every live unit by id (the base included), and what it is. */
  readonly units: Map<EntityId, Unit>;
  readonly kinds: Map<EntityId, UnitKind>;
  /** Who landed the killing hit, for units killed since the last deaths pass. */
  readonly killers: Map<EntityId, EntityId | null>;
  readonly inputs: Map<number, SlotInput>;
  /** The Citadel's footprint (tiles). */
  readonly baseRect: Rect;
  /** Reused query buffer (spatial hash results). */
  readonly scratch: EntityId[];
  tick(): number;
  modifiers(u: Unit): readonly Modifier[];
  hooks<K extends keyof Hooks>(u: Unit, key: K): NonNullable<Hooks[K]>[];
  attackStat(u: Unit, base: number, stat: StatId, scope?: 'main' | 'super'): number;
  player(slot: number): PlayerEnt | undefined;
  /** Alive, connected (not dazed) players are the only ones enemies can target (§11.3). */
  targetable(p: PlayerEnt): boolean;
  /** Nearest enemy whose circle is within `range` of (x, y); ties by id. */
  nearestEnemy(x: number, y: number, range: number, hitsFlyers: boolean): EnemyEnt | null;
  fire(spec: FireSpec): ProjectileEnt;
  tileKind(col: number, row: number): TileKind | null;
  classOf(p: PlayerEnt): ClassId;
  spawnEnemy(kind: EnemyId, x: number, y: number, lane: EnemyEnt['lane'], group?: number): EnemyEnt;
  placeStructure(kind: StructureId, col: number, row: number, owner: number): StructureEnt;
  /** Marks the flow fields for a rebuild (a blocker placed or destroyed). */
  fieldsDirty(): void;
  /**
   * The ground field toward the player in `slot` (Hunters, §15.5), kept in `world.fields.hunted`:
   * built on first use, rebuilt when that player moves to a new tile or the fields rebuild. Null if
   * there's no such player.
   */
  huntField(slot: number): FlowField | null;
}

/** The registered behaviors receive the frozen `SimCtx`; the sim always passes its `SimState`. */
export function state(ctx: SimCtx): SimState {
  return ctx as SimState;
}
