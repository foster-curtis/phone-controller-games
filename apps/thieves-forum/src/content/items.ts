// The 34 starter items (SPEC §6.5, §12.4), written by hand from `art/forum/items/items.json` (TF0).
// Items are data: growing to the full set (SPEC §9) is content, not code. Grab time is computed from
// the §6.5 rule by `grabMs()`, never stored. content.test checks every field against items.json.
import { balance } from './balance';
import type { ItemDef, ItemId, Placement, Rarity, ShopId } from './types';

export const ITEMS = [
  {
    id: 'loaf-of-bread',
    shop: 'bakery',
    name: 'Loaf of bread',
    value: 2,
    weight: 1,
    rarity: 'common',
    placement: 'counter',
    icon: 'items/bakery/loaf-of-bread.svg',
  },
  {
    id: 'honey-jar',
    shop: 'bakery',
    name: 'Honey jar',
    value: 8,
    weight: 2,
    rarity: 'common',
    placement: 'counter',
    icon: 'items/bakery/honey-jar.svg',
  },
  {
    id: 'cheese-wheel',
    shop: 'bakery',
    name: 'Cheese wheel',
    value: 6,
    weight: 3,
    rarity: 'common',
    placement: 'counter',
    icon: 'items/bakery/cheese-wheel.svg',
  },
  {
    id: 'honey-cake',
    shop: 'bakery',
    name: 'Honey cake',
    value: 20,
    weight: 1,
    rarity: 'uncommon',
    placement: 'shelf',
    icon: 'items/bakery/honey-cake.svg',
  },
  {
    id: 'clay-cup',
    shop: 'pottery',
    name: 'Clay cup',
    value: 3,
    weight: 1,
    rarity: 'common',
    placement: 'counter',
    icon: 'items/pottery/clay-cup.svg',
  },
  {
    id: 'oil-lamp',
    shop: 'pottery',
    name: 'Oil lamp',
    value: 6,
    weight: 1,
    rarity: 'common',
    placement: 'counter',
    icon: 'items/pottery/oil-lamp.svg',
  },
  {
    id: 'amphora',
    shop: 'pottery',
    name: 'Amphora',
    value: 15,
    weight: 6,
    rarity: 'common',
    placement: 'counter',
    icon: 'items/pottery/amphora.svg',
  },
  {
    id: 'painted-vase',
    shop: 'pottery',
    name: 'Painted vase',
    value: 35,
    weight: 3,
    rarity: 'uncommon',
    placement: 'shelf',
    icon: 'items/pottery/painted-vase.svg',
  },
  {
    id: 'sandals',
    shop: 'clothing',
    name: 'Sandals',
    value: 8,
    weight: 1,
    rarity: 'common',
    placement: 'counter',
    icon: 'items/clothing/sandals.svg',
  },
  {
    id: 'tunic',
    shop: 'clothing',
    name: 'Tunic',
    value: 12,
    weight: 2,
    rarity: 'common',
    placement: 'counter',
    icon: 'items/clothing/tunic.svg',
  },
  {
    id: 'wool-cloak',
    shop: 'clothing',
    name: 'Wool cloak',
    value: 30,
    weight: 3,
    rarity: 'uncommon',
    placement: 'shelf',
    icon: 'items/clothing/wool-cloak.svg',
  },
  {
    id: 'fine-toga',
    shop: 'clothing',
    name: 'Fine toga',
    value: 50,
    weight: 4,
    rarity: 'uncommon',
    placement: 'shelf',
    icon: 'items/clothing/fine-toga.svg',
  },
  {
    id: 'jug-of-cheap-wine',
    shop: 'wine',
    name: 'Jug of cheap wine',
    value: 10,
    weight: 3,
    rarity: 'common',
    placement: 'counter',
    icon: 'items/wine/jug-of-cheap-wine.svg',
  },
  {
    id: 'wine-amphora',
    shop: 'wine',
    name: 'Wine amphora',
    value: 25,
    weight: 6,
    rarity: 'uncommon',
    placement: 'shelf',
    icon: 'items/wine/wine-amphora.svg',
  },
  {
    id: 'fine-vintage',
    shop: 'wine',
    name: 'Fine vintage',
    value: 55,
    weight: 4,
    rarity: 'uncommon',
    placement: 'shelf',
    icon: 'items/wine/fine-vintage.svg',
  },
  {
    id: 'knife',
    shop: 'smithy',
    name: 'Knife',
    value: 10,
    weight: 1,
    rarity: 'common',
    placement: 'counter',
    icon: 'items/smithy/knife.svg',
  },
  {
    id: 'hammer',
    shop: 'smithy',
    name: 'Hammer',
    value: 15,
    weight: 3,
    rarity: 'common',
    placement: 'counter',
    icon: 'items/smithy/hammer.svg',
  },
  {
    id: 'gladius',
    shop: 'smithy',
    name: 'Gladius',
    value: 50,
    weight: 4,
    rarity: 'uncommon',
    placement: 'shelf',
    icon: 'items/smithy/gladius.svg',
  },
  {
    id: 'bronze-helmet',
    shop: 'smithy',
    name: 'Bronze helmet',
    value: 65,
    weight: 5,
    rarity: 'uncommon',
    placement: 'shelf',
    icon: 'items/smithy/bronze-helmet.svg',
  },
  {
    id: 'olive-oil-flask',
    shop: 'perfume',
    name: 'Olive oil flask',
    value: 10,
    weight: 2,
    rarity: 'common',
    placement: 'counter',
    icon: 'items/perfume/olive-oil-flask.svg',
  },
  {
    id: 'scented-oil',
    shop: 'perfume',
    name: 'Scented oil',
    value: 25,
    weight: 1,
    rarity: 'uncommon',
    placement: 'shelf',
    icon: 'items/perfume/scented-oil.svg',
  },
  {
    id: 'perfume-vial',
    shop: 'perfume',
    name: 'Perfume vial',
    value: 70,
    weight: 1,
    rarity: 'uncommon',
    placement: 'shelf',
    icon: 'items/perfume/perfume-vial.svg',
  },
  {
    id: 'sack-of-salt',
    shop: 'spices',
    name: 'Sack of salt',
    value: 5,
    weight: 3,
    rarity: 'common',
    placement: 'counter',
    icon: 'items/spices/sack-of-salt.svg',
  },
  {
    id: 'pepper-pouch',
    shop: 'spices',
    name: 'Pepper pouch',
    value: 25,
    weight: 1,
    rarity: 'uncommon',
    placement: 'shelf',
    icon: 'items/spices/pepper-pouch.svg',
  },
  {
    id: 'cinnamon-bundle',
    shop: 'spices',
    name: 'Cinnamon bundle',
    value: 40,
    weight: 1,
    rarity: 'uncommon',
    placement: 'shelf',
    icon: 'items/spices/cinnamon-bundle.svg',
  },
  {
    id: 'saffron-pouch',
    shop: 'spices',
    name: 'Saffron pouch',
    value: 90,
    weight: 1,
    rarity: 'uncommon',
    placement: 'shelf',
    icon: 'items/spices/saffron-pouch.svg',
  },
  {
    id: 'reed-mat',
    shop: 'rugs',
    name: 'Reed mat',
    value: 15,
    weight: 4,
    rarity: 'common',
    placement: 'counter',
    icon: 'items/rugs/reed-mat.svg',
  },
  {
    id: 'wool-rug',
    shop: 'rugs',
    name: 'Wool rug',
    value: 75,
    weight: 8,
    rarity: 'uncommon',
    placement: 'shelf',
    icon: 'items/rugs/wool-rug.svg',
  },
  {
    id: 'grand-carpet',
    shop: 'rugs',
    name: 'Grand carpet',
    value: 150,
    weight: 12,
    rarity: 'rare',
    placement: 'shelf',
    icon: 'items/rugs/grand-carpet.svg',
  },
  {
    id: 'glass-bead-necklace',
    shop: 'jewelry',
    name: 'Glass-bead necklace',
    value: 6,
    weight: 1,
    rarity: 'common',
    placement: 'counter',
    icon: 'items/jewelry/glass-bead-necklace.svg',
  },
  {
    id: 'bronze-ring',
    shop: 'jewelry',
    name: 'Bronze ring',
    value: 20,
    weight: 1,
    rarity: 'uncommon',
    placement: 'shelf',
    icon: 'items/jewelry/bronze-ring.svg',
  },
  {
    id: 'silver-bracelet',
    shop: 'jewelry',
    name: 'Silver bracelet',
    value: 100,
    weight: 1,
    rarity: 'rare',
    placement: 'shelf',
    icon: 'items/jewelry/silver-bracelet.svg',
  },
  {
    id: 'gold-necklace',
    shop: 'jewelry',
    name: 'Gold necklace',
    value: 280,
    weight: 1,
    rarity: 'rare',
    placement: 'shelf',
    icon: 'items/jewelry/gold-necklace.svg',
  },
  {
    id: 'gem-ring',
    shop: 'jewelry',
    name: 'Gem ring',
    value: 600,
    weight: 1,
    rarity: 'rare',
    placement: 'shelf',
    icon: 'items/jewelry/gem-ring.svg',
  },
] as const satisfies readonly ItemDef[];

const byId = new Map<ItemId, ItemDef>(ITEMS.map((i) => [i.id, i]));

/** The item with this id; throws on an unknown id (a content bug). */
export function item(id: ItemId): ItemDef {
  const def = byId.get(id);
  if (!def) throw new Error(`unknown item: ${id}`);
  return def;
}

export function isItemId(id: unknown): id is ItemId {
  return typeof id === 'string' && byId.has(id);
}

/** Every item a shop stocks, in data order. */
export function itemsOf(shop: ShopId): ItemDef[] {
  return ITEMS.filter((i) => i.shop === shop);
}

/**
 * Grab time (SPEC §6.5): `500 + 100 × weight + 2 × value`, rounded to the nearest 50 ms, plus the
 * back-shelf reach penalty (§6.7) when `fromShelf`.
 */
export function grabMs(def: Pick<ItemDef, 'value' | 'weight'>, fromShelf = false): number {
  const g = balance.grab;
  const raw = g.baseMs + g.perWeightMs * def.weight + g.perValueMs * def.value;
  return Math.round(raw / g.roundToMs) * g.roundToMs + (fromShelf ? g.reachPenaltyMs : 0);
}

const SHELF_RARITIES: readonly Rarity[] = ['uncommon', 'rare'];

/**
 * The §6.5 placement rule for one shop's items: common on the counter, uncommon and rare on the back
 * shelf; if a shop has no common items its cheapest go on the counter, and if it has only common items
 * its most expensive go on the back shelf, so neither row is ever empty.
 */
export function placementRule(items: readonly ItemDef[]): Map<ItemId, Placement> {
  const out = new Map<ItemId, Placement>();
  for (const i of items) out.set(i.id, SHELF_RARITIES.includes(i.rarity) ? 'shelf' : 'counter');
  if (items.length < 2) return out;
  const byValue = [...items].sort((a, b) => a.value - b.value || a.id.localeCompare(b.id));
  if (![...out.values()].includes('counter')) out.set(byValue[0]!.id, 'counter');
  if (![...out.values()].includes('shelf')) out.set(byValue[byValue.length - 1]!.id, 'shelf');
  return out;
}
