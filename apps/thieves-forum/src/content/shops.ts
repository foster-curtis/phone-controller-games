// The 10 shops (SPEC §6.3, §6.5, §12.4): name, canopy color by brand token name, stock slots and
// restock rules. The pawnbroker buys only (§6.4) and stocks nothing. Slot counts follow the stall art
// (`art/forum/stalls/`, ART_NOTES: four counter and four shelf item spots); restock times come from
// balance.stock. Which shops open in a match is the §6.3 rule (match/, TF10).
import { balance } from './balance';
import type { RestockRule, ShopDef, ShopId } from './types';

const restock: RestockRule = {
  commonMs: balance.stock.commonRestockMs,
  uncommonMs: balance.stock.uncommonRestockMs,
  rareMs: null,
};

const stocked = (id: ShopId, name: string): ShopDef => ({
  id,
  name,
  canopy: id,
  sells: true,
  slots: { counter: 4, shelf: 4 },
  raresPerRound: balance.stock.raresPerStall,
  restock,
});

export const SHOPS = {
  pawnbroker: {
    id: 'pawnbroker',
    name: 'Pawnbroker',
    canopy: 'pawnbroker',
    sells: false,
    slots: { counter: 0, shelf: 0 },
    raresPerRound: 0,
    restock,
  },
  bakery: stocked('bakery', 'Bakery'),
  pottery: stocked('pottery', 'Pottery'),
  clothing: stocked('clothing', 'Clothing'),
  wine: stocked('wine', 'Wine merchant'),
  smithy: stocked('smithy', 'Smithy and tools'),
  perfume: stocked('perfume', 'Perfume and oils'),
  spices: stocked('spices', 'Spices'),
  rugs: stocked('rugs', 'Rugs'),
  jewelry: stocked('jewelry', 'Jewelry'),
} as const satisfies Record<ShopId, ShopDef>;

/** The §6.3 open-stall rule's fixed picks: always open, plus one of the cheap pair. */
export const ALWAYS_OPEN: readonly ShopId[] = ['pawnbroker', 'jewelry'];
export const CHEAP_ONE_OF: readonly ShopId[] = ['bakery', 'pottery'];
