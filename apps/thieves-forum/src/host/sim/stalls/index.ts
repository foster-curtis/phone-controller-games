// Stall stock and views (SPEC §6.5, §6.6, §6.7): the §6.5 placement rule and fallback, about one rare
// per stall per round, restock by rarity (common soon, uncommon slowly, rare never), and the private
// stall view a browsing player sees (taken, too heavy, out of reach). A grab or a purchase only shows on
// the TV as `stallChanged`, which names a stall, not a player (SPEC §6.11, §12.3).
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are the owner's.
import type { Rng } from '@pcg/game-kit';
import { grabMs, placementRule } from '../../../content/items';
import type { Content, ItemDef, ShopId, StallId } from '../../../content/types';
import type { StallView, StallViewItem, ViewItemState } from '../../../shared/viewer/types';
import type { StepContext } from '../systems';
import type { Character, EntityId, Stall, StallSlot, World } from '../types';
import { THEFT_HOOKS } from './hooks';
import type { StallsApi } from './types';

export type { StallsApi } from './types';
export { THEFT_HOOKS, type TheftHooks } from './hooks';

// ---- stock (SPEC §6.5) -------------------------------------------------------------------------

function slotOf(slot: number, row: StallSlot['row'], item: ItemDef | null): StallSlot {
  const id = item?.id ?? null;
  return { slot, row, item: id, heldBy: null, forward: false, restockAt: null, stocked: id };
}

/** `n` items cycling through `pool` from `start` (a row's spots repeat items when it has few). */
function cycle(pool: readonly ItemDef[], n: number, start: number): ItemDef[] {
  return pool.length === 0
    ? []
    : Array.from({ length: n }, (_, i) => pool[(start + i) % pool.length]!);
}

/**
 * A shop's slots for one round: counter spots cycle its counter items; the back shelf gets up to
 * `raresPerRound` rares (picked from the stream) and cycles its uncommon items in the rest. A shelf
 * with only rares keeps its spare spots empty rather than stock more rares (SPEC §7 "~1 per stall").
 */
export function stockShop(rng: Rng, shop: ShopId, content: Content): StallSlot[] {
  const def = content.shops[shop];
  const items = content.items.filter((i) => i.shop === shop);
  if (!def.sells || items.length === 0) return [];
  const place = placementRule(items);
  const counter = items.filter((i) => place.get(i.id) === 'counter');
  const shelf = items.filter((i) => place.get(i.id) === 'shelf');
  const rares = shelf.filter((i) => i.rarity === 'rare');
  const others = shelf.filter((i) => i.rarity !== 'rare');
  const chosen: ItemDef[] = [];
  const pool = [...rares];
  const wantRares = Math.max(def.raresPerRound, others.length === 0 && rares.length > 0 ? 1 : 0);
  while (chosen.length < Math.min(wantRares, def.slots.shelf) && pool.length > 0) {
    chosen.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]!);
  }
  const shelfItems = [
    ...chosen,
    ...cycle(others, def.slots.shelf - chosen.length, rng.int(0, others.length)),
  ];
  const counterItems = cycle(counter, def.slots.counter, rng.int(0, counter.length));
  const out: StallSlot[] = [];
  for (let i = 0; i < def.slots.counter; i++)
    out.push(slotOf(i, 'counter', counterItems[i] ?? null));
  for (let i = 0; i < def.slots.shelf; i++) {
    out.push(slotOf(def.slots.counter + i, 'shelf', shelfItems[i] ?? null));
  }
  return out;
}

/** ms until a taken item comes back, or null for never (SPEC §6.5 rarity). */
export function restockMs(def: ItemDef, content: Content): number | null {
  const r = content.shops[def.shop].restock;
  return def.rarity === 'common' ? r.commonMs : def.rarity === 'uncommon' ? r.uncommonMs : r.rareMs;
}

/** Brings back taken items whose restock time has come (SPEC §6.5); emits `stallChanged`. */
export function restock(ctx: StepContext): void {
  for (const s of ctx.world.stalls) {
    let changed = false;
    for (const sl of s.slots) {
      if (sl.item !== null || sl.restockAt === null || ctx.world.tick < sl.restockAt) continue;
      sl.item = sl.stocked ?? null;
      sl.restockAt = null;
      changed = true;
    }
    if (changed) ctx.emit({ ch: 'tv', e: 'stallChanged', stall: s.id });
  }
}

// ---- the private stall view (SPEC §6.7, §6.17) -------------------------------------------------

const itemDef = (content: Content, id: string) => content.items.find((i) => i.id === id) ?? null;

/** The stall's merchant is out from behind his counter (SPEC §6.7). */
export function merchantAway(world: World, stall: Stall): boolean {
  const m = stall.merchant === null ? null : world.merchants.find((mm) => mm.id === stall.merchant);
  return m?.spot === 'away';
}

/** A tile's grab time now: the §6.5 rule plus the back-shelf reach penalty (SPEC §6.7). */
export const tileGrabMs = (def: ItemDef, sl: StallSlot): number => grabMs(def, sl.row === 'shelf');

/** One slot's state for `viewer` (priority: taken, out of reach, too heavy). */
export function slotState(
  world: World,
  stall: Stall,
  sl: StallSlot,
  viewer: EntityId,
  def: ItemDef,
  packWeight: number,
  content: Content,
): ViewItemState {
  if (sl.heldBy !== null && sl.heldBy !== viewer) return 'takenByOther';
  if (sl.row === 'shelf' && !merchantAway(world, stall)) return 'outOfReach';
  if (packWeight + def.weight > content.balance.match.packCapacity) return 'tooHeavy';
  return 'free';
}

/** The ledger's pack weight for a player character (0 without a ledger or for NPCs). */
export function packWeightOf(c: Character | null): number {
  const ledger = THEFT_HOOKS.ledger;
  return c?.side && ledger ? ledger.packWeight(c.side) : 0;
}

/**
 * What `char` may see of `stall` now (SPEC §6.7): counter row (items brought forward included) and
 * back shelf, each tile with its price, grab time and state. Empty spots are left out.
 */
export function stallViewFor(
  world: World,
  stall: Stall,
  char: Character | null,
  content: Content,
): StallView {
  const shop = content.shops[stall.shop];
  const weight = packWeightOf(char);
  const counter: StallViewItem[] = [];
  const shelf: StallViewItem[] = [];
  for (const sl of stall.slots) {
    const def = sl.item === null ? null : itemDef(content, sl.item);
    if (!def) continue;
    const tile: StallViewItem = {
      slot: sl.slot,
      item: def.id,
      name: def.name,
      price: def.value,
      grabMs: tileGrabMs(def, sl),
      rarity: def.rarity,
      state: slotState(world, stall, sl, char?.id ?? -1, def, weight, content),
    };
    (sl.row === 'counter' ? counter : shelf).push(tile);
  }
  return { stall: stall.id, canopy: shop.canopy, title: shop.name, counter, shelf };
}

// ---- the API -----------------------------------------------------------------------------------

const findStall = (world: World, id: StallId) => world.stalls.find((s) => s.id === id) ?? null;

export const stalls: StallsApi = {
  stock: stockShop,

  view(world, stall, viewer, content) {
    const s = findStall(world, stall);
    if (!s) throw new Error(`stalls.view: no stall ${stall}`);
    return stallViewFor(world, s, world.characters.find((c) => c.id === viewer) ?? null, content);
  },

  take(ctx, stall, slot) {
    const sl = findStall(ctx.world, stall)?.slots.find((x) => x.slot === slot);
    if (!sl || sl.item === null) return;
    const def = itemDef(ctx.content, sl.item);
    sl.item = null;
    sl.heldBy = null;
    // An item the merchant left out goes back to being a shelf spot (it restocks there, SPEC §6.6).
    if (sl.forward) {
      sl.forward = false;
      sl.row = 'shelf';
    }
    const ms = def ? restockMs(def, ctx.content) : null;
    sl.restockAt = ms === null ? null : ctx.world.tick + ctx.ticks(ms);
    ctx.emit({ ch: 'tv', e: 'stallChanged', stall });
  },

  putBack(ctx, stall, slot) {
    const sl = findStall(ctx.world, stall)?.slots.find((x) => x.slot === slot);
    if (!sl || sl.item !== null || !sl.stocked) return;
    sl.item = sl.stocked;
    sl.restockAt = null;
    ctx.emit({ ch: 'tv', e: 'stallChanged', stall });
  },
};
