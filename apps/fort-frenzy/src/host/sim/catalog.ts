// Content as the sim reads it (SPEC §15.4): lookups by id, the required singletons, and config times
// converted to whole steps (§15.3 determinism: timers are steps).
import type { Content } from '../../content';
import type {
  BaseDef,
  CharacterDef,
  DifficultyDef,
  EnemyDef,
  MapDef,
  RulesDef,
  ScalingDef,
  ShopItemDef,
  StructureDef,
  WaveDef,
} from '../../content/types';
import type { ClassId, DifficultyId, EnemyId, ShopItemId, StructureId } from '../../shared/ids';
import { msToSteps } from '../systems/effects';
import { groundBody, type GroundBody } from './body';
import { SIM_HZ } from './types';

export interface Catalog {
  readonly content: Content;
  readonly map: MapDef;
  readonly base: BaseDef;
  readonly rules: RulesDef;
  readonly scaling: ScalingDef;
  readonly difficulty: DifficultyDef;
  readonly waves: readonly WaveDef[];
  character(id: ClassId): CharacterDef;
  enemy(id: EnemyId): EnemyDef;
  structure(id: StructureId): StructureDef;
  shopItem(id: ShopItemId): ShopItemDef | undefined;
  wave(n: number): WaveDef | undefined;
  /** Config ms → whole steps (≥ 1 for any positive time). */
  steps(ms: number): number;
  /** An enemy's body hitbox on the ground (C4, body.ts): what our attacks hit. */
  body(id: EnemyId): GroundBody;
  /**
   * Over every enemy: the widest body radius and the farthest a body reaches north of its feet
   * (hi + r), so hit queries look that far south of a shot for the feet.
   */
  readonly bodyMax: { r: number; reach: number };
}

function need<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`sim: content has no ${what}`);
  return v;
}

function byId<T extends { id: string }>(list: readonly T[], what: string): (id: string) => T {
  const m = new Map(list.map((x) => [x.id, x]));
  return (id) => {
    const v = m.get(id);
    if (!v) throw new Error(`sim: unknown ${what} '${id}'`);
    return v;
  };
}

export function createCatalog(content: Content, difficulty: DifficultyId): Catalog {
  const shop = new Map(content.shop.map((s) => [s.id, s]));
  const waves = [...content.waves].sort((a, b) => a.n - b.n);
  const bodies = new Map<string, GroundBody>(
    content.enemies.map((e) => [e.id, groundBody(need(e.body, `body for enemy '${e.id}'`))]),
  );
  const bodyMax = { r: 0, reach: 0 };
  for (const b of bodies.values()) {
    bodyMax.r = Math.max(bodyMax.r, b.r);
    bodyMax.reach = Math.max(bodyMax.reach, b.hi + b.r);
  }
  return {
    content,
    map: need(content.map, 'map'),
    base: need(content.base, 'base'),
    rules: need(content.rules, 'rules'),
    scaling: need(content.scaling, 'scaling'),
    difficulty: byId(content.difficulties, 'difficulty')(difficulty),
    waves,
    character: byId(content.characters, 'class'),
    enemy: byId(content.enemies, 'enemy'),
    structure: byId(content.structures, 'structure'),
    shopItem: (id) => shop.get(id),
    wave: (n) => waves.find((w) => w.n === n),
    steps: (ms) => msToSteps(ms, SIM_HZ),
    body: (id) => need(bodies.get(id), `enemy '${id}'`),
    bodyMax,
  };
}
