// Content bundle (SPEC §12.4): the one import for the sim, the match and phone-facing code.
// Append-only registry (BUILD_PLAN §2): add exports, never reorder or remove.
import { balance } from './balance';
import { ITEMS } from './items';
import { LAYOUT } from './layout';
import { SHOPS } from './shops';
import type { Content } from './types';

export { balance } from './balance';
export { grabMs, isItemId, item, ITEMS, itemsOf, placementRule } from './items';
export { LAYOUT } from './layout';
export { ALWAYS_OPEN, CHEAP_ONE_OF, SHOPS } from './shops';
export * from './types';

export const CONTENT: Content = { balance, items: ITEMS, shops: SHOPS, layout: LAYOUT };
