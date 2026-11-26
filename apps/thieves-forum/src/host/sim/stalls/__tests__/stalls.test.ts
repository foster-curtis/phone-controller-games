// Stall stock and the private stall view (SPEC §6.5, §6.7): placement and fallback, ~1 rare per stall,
// restock by rarity, put back, and the tile states (taken, too heavy, out of reach).
import { rngStream } from '@pcg/game-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTENT, grabMs, item } from '../../../../content';
import type { Content, ItemDef, ShopId } from '../../../../content/types';
import { SHOP_IDS } from '../../../../content/types';
import { BAKERY, noGlances, rig, withLedger } from '../../merchants/__tests__/fixtures';
import { restock, stalls, stockShop, THEFT_HOOKS } from '../index';

afterEach(() => {
  THEFT_HOOKS.ledger = null;
});

const rarityOf = (id: string | null) => (id === null ? null : item(id).rarity);

describe('stock (SPEC §6.5)', () => {
  it('commons on the counter, uncommon and rare on the back shelf, no row ever empty', () => {
    for (const shop of SHOP_IDS) {
      const slots = stockShop(rngStream(3, 'stock'), shop, CONTENT);
      if (shop === 'pawnbroker') {
        expect(slots).toEqual([]);
        continue;
      }
      const counter = slots.filter((s) => s.row === 'counter');
      const shelf = slots.filter((s) => s.row === 'shelf');
      expect(counter.length).toBe(4);
      expect(shelf.length).toBe(4);
      expect(counter.some((s) => s.item !== null)).toBe(true);
      expect(shelf.some((s) => s.item !== null)).toBe(true);
      expect(new Set(slots.map((s) => s.slot)).size).toBe(8);
      for (const s of slots) expect(s.stocked).toBe(s.item);
      if (CONTENT.items.some((i) => i.shop === shop && i.rarity === 'common')) {
        for (const s of counter) expect(rarityOf(s.item)).toBe('common');
      }
      for (const s of shelf) if (s.item) expect(rarityOf(s.item)).not.toBe('common');
    }
  });

  it('stocks about one rare per stall per round, chosen from the stream', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      const slots = stockShop(rngStream(seed, 'stock'), 'jewelry', CONTENT);
      const rares = slots.filter((s) => rarityOf(s.item) === 'rare');
      expect(rares.length).toBe(1);
      seen.add(rares[0]!.item!);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('falls back stall by stall: no commons → cheapest on the counter; only commons → dearest on the shelf', () => {
    const mk = (id: string, value: number, rarity: ItemDef['rarity']): ItemDef => ({
      id,
      shop: 'bakery',
      name: id,
      value,
      weight: 1,
      rarity,
      placement: rarity === 'common' ? 'counter' : 'shelf',
      icon: '',
    });
    const noCommon: Content = {
      ...CONTENT,
      items: [mk('a', 30, 'uncommon'), mk('b', 10, 'uncommon'), mk('c', 50, 'uncommon')],
    };
    const s1 = stockShop(rngStream(1, 'stock'), 'bakery', noCommon);
    expect(s1.filter((s) => s.row === 'counter').every((s) => s.item === 'b')).toBe(true);
    const onlyCommon: Content = {
      ...CONTENT,
      items: [mk('a', 3, 'common'), mk('b', 9, 'common'), mk('c', 5, 'common')],
    };
    const s2 = stockShop(rngStream(1, 'stock'), 'bakery', onlyCommon);
    expect(s2.filter((s) => s.row === 'shelf').every((s) => s.item === 'b')).toBe(true);
  });
});

describe('restock and put back (SPEC §6.5, §6.13)', () => {
  it('common restocks soon, uncommon slowly, rare never; put back restores at once', () => {
    const r = rig(0);
    const ctx = r.sim.context();
    const b = CONTENT.balance.stock;
    const bakery = r.stall(BAKERY);
    const common = bakery.slots.find((s) => s.row === 'counter')!;
    const uncommon = bakery.slots.find((s) => s.row === 'shelf')!;
    const t0 = r.sim.world.tick;
    stalls.take(ctx, BAKERY, common.slot);
    stalls.take(ctx, BAKERY, uncommon.slot);
    expect(common.item).toBeNull();
    expect(common.restockAt).toBe(t0 + ctx.ticks(b.commonRestockMs));
    expect(uncommon.restockAt).toBe(t0 + ctx.ticks(b.uncommonRestockMs));
    const jewelry = r.stall(9);
    const rare = jewelry.slots.find((s) => rarityOf(s.item) === 'rare')!;
    stalls.take(ctx, 9, rare.slot);
    expect(rare.restockAt).toBeNull();

    r.sim.world.tick = t0 + ctx.ticks(b.commonRestockMs);
    r.sim.world.events.length = 0;
    restock(ctx);
    expect(common.item).toBe(common.stocked);
    expect(uncommon.item).toBeNull();
    expect(r.sim.world.events).toEqual([{ ch: 'tv', e: 'stallChanged', stall: BAKERY }]);
    r.sim.world.tick = t0 + ctx.ticks(b.uncommonRestockMs);
    restock(ctx);
    expect(uncommon.item).toBe(uncommon.stocked);
    expect(rare.item).toBeNull();

    r.sim.world.events.length = 0;
    stalls.putBack(ctx, 9, rare.slot);
    expect(rare.item).toBe(rare.stocked);
    expect(r.sim.world.events).toEqual([{ ch: 'tv', e: 'stallChanged', stall: 9 }]);
  });
});

describe('stall view (SPEC §6.7, §6.17)', () => {
  it('shows header, rows, prices and grab times (+500 ms on the back shelf)', () => {
    const r = rig(1);
    const v = stalls.view(r.sim.world, BAKERY, r.player(1).id, CONTENT);
    expect(v.title).toBe('Bakery');
    expect(v.canopy).toBe('bakery');
    expect(v.counter.length).toBe(4);
    const c = v.counter[0]!;
    expect(c.grabMs).toBe(grabMs(item(c.item)));
    expect(c.price).toBe(item(c.item).value);
    expect(c.state).toBe('free');
    const s = v.shelf[0]!;
    expect(s.grabMs).toBe(grabMs(item(s.item)) + CONTENT.balance.grab.reachPenaltyMs);
    expect(s.state).toBe('outOfReach');
  });

  it('back shelf is grabbable while the merchant is away', () => {
    const r = rig(1);
    noGlances(r);
    r.merchant(BAKERY).spot = 'away';
    const v = stalls.view(r.sim.world, BAKERY, r.player(1).id, CONTENT);
    expect(v.shelf.every((t) => t.state === 'free')).toBe(true);
  });

  it('marks an item held by someone else taken, and items over the pack cap too heavy', () => {
    const r = rig(2);
    const ledger = withLedger();
    const slot = r.stall(BAKERY).slots[0]!;
    slot.heldBy = r.player(1).id;
    expect(stalls.view(r.sim.world, BAKERY, r.player(1).id, CONTENT).counter[0]!.state).toBe(
      'free',
    );
    expect(stalls.view(r.sim.world, BAKERY, r.player(2).id, CONTENT).counter[0]!.state).toBe(
      'takenByOther',
    );
    const side = r.player(2).side!;
    const cap = CONTENT.balance.match.packCapacity;
    ledger.packs.set(side.id, [{ item: 'x', value: 0, weight: cap }]);
    const v = stalls.view(r.sim.world, BAKERY, r.player(2).id, CONTENT);
    expect(v.counter.slice(1).every((t) => t.state === 'tooHeavy')).toBe(true);
  });
});

// Keep the shop list honest: every stocked shop is in SHOP_IDS.
it('covers every shop', () => {
  expect(Object.keys(CONTENT.shops).sort()).toEqual([...SHOP_IDS].sort() as ShopId[]);
});
