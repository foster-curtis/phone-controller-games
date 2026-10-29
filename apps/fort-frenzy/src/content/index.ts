// Gameplay content registry (SPEC §15.4): one export per domain file in src/content/, typed with
// `satisfies` against ./types. Append-only registry (BUILD_PLAN §3): add entries at the end, never
// reorder or delete.
import type {
  CardDef,
  CharacterDef,
  DifficultyDef,
  EnemyDef,
  MapDef,
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
}

export const content: Content = {
  characters: [],
  enemies: [],
  structures: [],
  cards: [],
  shop: [],
  waves: [],
  difficulties: [],
  scaling: null,
  map: null,
};
