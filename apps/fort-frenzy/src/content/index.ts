// Gameplay content registry (SPEC §15.4): the balance sheet (./balance.ts, every tuning number) and
// the map (./map.ts), typed with `satisfies` against ./types. Append-only registry (REDESIGN_BUILD_PLAN
// §3): add entries at the end, never reorder or delete. Lists stay arrays (looked up by id through the
// sim's catalog), not the SPEC sketch's records (RD2 contract note).
import {
  artificer,
  base,
  builds,
  brute,
  cards,
  classes,
  colossus,
  commander,
  difficulties,
  flyer,
  grunt,
  harness,
  hunter,
  ranger,
  rules,
  runner,
  scaling,
  shop,
  siege,
  swarm,
  warden,
  waves,
} from './balance';
import { mapV1 } from './map';
import type {
  BaseDef,
  BuildDef,
  CardDef,
  ClassDef,
  DifficultyDef,
  EnemyDef,
  HarnessDef,
  KnightDef,
  MapDef,
  PlayerCountRow,
  RulesDef,
  ShopItemDef,
  WaveDef,
} from './types';

export interface Content {
  knights: readonly KnightDef[];
  enemies: readonly EnemyDef[];
  cards: readonly CardDef[];
  shop: readonly ShopItemDef[];
  waves: readonly WaveDef[];
  difficulties: readonly DifficultyDef[];
  /** The player-count table, one row per player count 1–6 (§9.4). */
  scaling: readonly PlayerCountRow[];
  map: MapDef | null;
  base: BaseDef | null;
  rules: RulesDef | null;
  classes: readonly ClassDef[];
  builds: readonly BuildDef[];
  harness: HarnessDef | null;
}

export const content: Content = {
  knights: [ranger, artificer, commander, warden],
  enemies: [grunt, runner, swarm, brute, flyer, siege, hunter, colossus],
  cards: [...cards],
  shop: [...shop],
  waves: [...waves],
  difficulties: [...difficulties],
  scaling: [...scaling],
  map: mapV1,
  base: base,
  rules: rules,
  classes: [...classes],
  builds: [...builds],
  harness: harness,
};
