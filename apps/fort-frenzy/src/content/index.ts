// Gameplay content registry (SPEC §15.4): one export per domain file in src/content/, typed with
// `satisfies` against ./types. Append-only registry (BUILD_PLAN §3): add entries at the end, never
// reorder or delete.
import { base, rules } from './base';
import { commander, engineer, quartermaster } from './characters';
import { difficulties, scaling } from './difficulty';
import { grunt } from './enemies';
import { mapV1 } from './map';
import { crate } from './shop';
import { arrowTower } from './structures';
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
import { waves } from './waves';

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
  characters: [engineer, quartermaster, commander],
  enemies: [grunt],
  structures: [arrowTower],
  cards: [],
  shop: [crate],
  waves: [...waves],
  difficulties: [...difficulties],
  scaling: scaling,
  map: mapV1,
  base: base,
  rules: rules,
};
