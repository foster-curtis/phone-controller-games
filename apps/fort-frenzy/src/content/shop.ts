// Team shop items (SPEC §6.2). FF6: the crate only, whose price the Armory pad (depot) charges (§6);
// the rest of the shop arrives in FF12.
import type { ShopItemDef } from './types';

export const crate = {
  id: 'crate',
  tiers: [{ price: 2, effect: { kind: 'crates', count: 1 } }],
  repeatable: true,
} satisfies ShopItemDef;

export const shop: ShopItemDef[] = [crate];
