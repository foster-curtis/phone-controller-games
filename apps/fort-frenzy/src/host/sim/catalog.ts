// Content as the sim reads it (SPEC §15.4): lookups by id, the required singletons, and config times
// converted to whole steps (§15.3 determinism: timers are steps).
import type { Content } from '../../content';
import type {
  BaseDef,
  BuildDef,
  ClassDef,
  DifficultyDef,
  EnemyDef,
  KnightDef,
  MapDef,
  PlayerCountRow,
  RulesDef,
  ShopItemDef,
  WaveDef,
} from '../../content/types';
import type {
  BuildId,
  DifficultyId,
  EnemyId,
  KnightId,
  RoleId,
  ShopItemId,
} from '../../shared/ids';
import { msToSteps } from '../systems/effects';
import { groundBody, type GroundBody } from './body';
import { SIM_HZ } from './types';

export interface Catalog {
  readonly content: Content;
  readonly map: MapDef;
  readonly base: BaseDef;
  readonly rules: RulesDef;
  readonly difficulty: DifficultyDef;
  readonly waves: readonly WaveDef[];
  knight(id: KnightId): KnightDef;
  /** A class (§8.1) by role. */
  role(id: RoleId): ClassDef;
  build(id: BuildId): BuildDef;
  enemy(id: EnemyId): EnemyDef;
  /** The player-count table row for `players` (clamped to 1–6, §9.4). */
  playerCount(players: number): PlayerCountRow;
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
    difficulty: byId(content.difficulties, 'difficulty')(difficulty),
    waves,
    knight: byId(content.knights, 'knight'),
    role: byId(content.classes, 'class'),
    build: byId(content.builds, 'build'),
    enemy: byId(content.enemies, 'enemy'),
    playerCount(players) {
      const rows = content.scaling;
      if (rows.length === 0) throw new Error('sim: content has no player-count table');
      const n = Math.min(6, Math.max(1, players));
      return rows.find((r) => r.players === n) ?? rows[rows.length - 1]!;
    },
    shopItem: (id) => shop.get(id),
    wave: (n) => waves.find((w) => w.n === n),
    steps: (ms) => msToSteps(ms, SIM_HZ),
    body: (id) => need(bodies.get(id), `enemy '${id}'`),
    bodyMax,
  };
}
