// Gameplay content registry (SPEC §15.4): the balance sheet (./balance.ts, every tuning number) and
// the map (./map.ts), typed with `satisfies` against ./types. Append-only registry (BUILD_PLAN §3):
// add entries at the end, never reorder or delete.
import {
  arrowTower,
  base,
  bombTower,
  brute,
  cards,
  colossus,
  commander,
  difficulties,
  engineer,
  flyer,
  fortify,
  grunt,
  hunter,
  quartermaster,
  rules,
  runner,
  scaling,
  shop,
  siege,
  snare,
  swarm,
  wall,
  warden,
  waves,
} from './balance';
import { mapV1 } from './map';
import type {
  BaseDef,
  CardDef,
  CharacterDef,
  DifficultyDef,
  EnemyDef,
  MapDef,
  RulesDef,
  ScalingDef,
  ShopItemDef,
  StructureDef,
  WaveDef,
} from './types';

export interface Content {
  characters: readonly CharacterDef[];
  enemies: readonly EnemyDef[];
  structures: readonly StructureDef[];
  cards: readonly CardDef[];
  shop: readonly ShopItemDef[];
  waves: readonly WaveDef[];
  difficulties: readonly DifficultyDef[];
  scaling: ScalingDef | null;
  map: MapDef | null;
  /** FF6. */
  base: BaseDef | null;
  rules: RulesDef | null;
}

export const content: Content = {
  characters: [engineer, quartermaster, commander, warden],
  enemies: [grunt, runner, swarm, brute, flyer, siege, hunter, colossus],
  structures: [arrowTower, bombTower, wall, snare, fortify],
  cards: [...cards],
  shop: [...shop],
  waves: [...waves],
  difficulties: [...difficulties],
  scaling: scaling,
  map: mapV1,
  base: base,
  rules: rules,
};
