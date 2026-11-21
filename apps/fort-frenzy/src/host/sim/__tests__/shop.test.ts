// Team shop scenarios (SPEC §3.4, §3.5, §6.2, §10.3): every item always shown, rising tiers, rising
// repair, base max HP raising current HP, the sentry upgrades, the wishlist and purchase
// announcements; and difficulty (§2.2) baked in at spawn.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { SHOP_ITEM_IDS, type ClassId, type ShopItemId } from '../../../shared/ids';
import { itemState } from '../index';
import type { SimCommand, SimEvent } from '../types';
import { harness, type Harness } from './harness';

const item = (id: ShopItemId) => content.shop.find((s) => s.id === id)!;
const visible = (h: Harness, id: ShopItemId) => itemState(content, h.sim.world, item(id)).visible;

function ack(h: Harness, cmd: SimCommand) {
  h.sim.command({ ...cmd, ref: 7 });
  h.run(1);
  return h.events('command').find((e) => e.ref === 7) as Extract<SimEvent, { e: 'command' }>;
}

function shopAt(classes: ClassId[], coins = 500): Harness {
  const h = harness(classes.length, 1, { classes });
  h.toBuild();
  h.sim.world.team.coins = coins;
  return h;
}

describe('visibility (§6.2: every item is always shown)', () => {
  it('every item is visible to every team', () => {
    for (const classes of [['ranger'], ['warden', 'commander']] as ClassId[][]) {
      const h = shopAt(classes);
      for (const id of SHOP_ITEM_IDS) expect(visible(h, id), id).toBe(true);
    }
  });
});

describe('purchases', () => {
  it('prices rise per tier, tiers sell out, and big ones need a hold to confirm', () => {
    const h = shopAt(['ranger']);
    const prices: (number | null)[] = [];
    for (let i = 0; i < 4; i++) {
      prices.push(itemState(content, h.sim.world, item('base_armor')).price);
      ack(h, { c: 'buy', slot: 0, item: 'base_armor' });
    }
    expect(prices).toEqual([8, 12, 16, null]);
    expect(h.sim.world.team.shop.base_armor).toBe(3);
    expect(ack(h, { c: 'buy', slot: 0, item: 'base_armor' }).reason).toBe('invalid');
    expect(itemState(content, h.sim.world, item('archer_third')).holdToConfirm).toBe(true);
    expect(itemState(content, h.sim.world, item('repair')).holdToConfirm).toBe(false);
  });

  it('refuses without the coins, and outside the build phase', () => {
    const h = shopAt(['ranger'], 3);
    expect(ack(h, { c: 'buy', slot: 0, item: 'base_hp' }).reason).toBe('coins');
    h.toCombat();
    h.sim.world.team.coins = 100;
    expect(ack(h, { c: 'buy', slot: 0, item: 'base_hp' }).reason).toBe('phase');
  });

  it('base max HP: each tier raises max HP and current HP by the same amount (#95)', () => {
    const h = shopAt(['ranger']);
    const b = h.sim.world.base;
    b.hp = b.maxHp - 100;
    const [max0, hp0] = [b.maxHp, b.hp];
    expect(ack(h, { c: 'buy', slot: 0, item: 'base_hp' }).ok).toBe(true);
    expect(b.maxHp).toBe(max0 + 150);
    expect(b.hp).toBe(hp0 + 150);
  });

  it('repair restores base HP at a price that rises each purchase', () => {
    const h = shopAt(['ranger']);
    const b = h.sim.world.base;
    b.hp = 200;
    const prices: number[] = [];
    for (let i = 0; i < 3; i++) {
      prices.push(itemState(content, h.sim.world, item('repair')).price!);
      expect(ack(h, { c: 'buy', slot: 0, item: 'repair' }).ok).toBe(true);
    }
    expect(prices).toEqual([4, 6, 8]);
    expect(b.hp).toBe(200 + 3 * 150);
    expect(b.repairs).toBe(3);
    b.hp = b.maxHp;
    expect(ack(h, { c: 'buy', slot: 0, item: 'repair' }).reason).toBe('invalid');
  });

  it('sentry upgrades: damage, range and a third archer, each once', () => {
    const h = shopAt(['ranger']);
    ack(h, { c: 'buy', slot: 0, item: 'archer_third' });
    expect(h.sim.world.base.archers.count).toBe(3);
    expect(h.sim.world.base.archers.attack).toHaveLength(3);
    expect(ack(h, { c: 'buy', slot: 0, item: 'archer_third' }).reason).toBe('invalid');
    ack(h, { c: 'buy', slot: 0, item: 'archer_damage' });
    ack(h, { c: 'buy', slot: 0, item: 'archer_range' });
    expect(h.sim.world.base.mods.map((m) => m.id).sort()).toEqual([
      'shop:archer_damage',
      'shop:archer_range',
    ]);
  });
});

describe('wishlist and announcements', () => {
  it('a request shows until someone buys the item or the wave starts; every purchase is announced', () => {
    const h = shopAt(['ranger', 'ranger']);
    const w = h.sim.world;
    ack(h, { c: 'request', slot: 0, item: 'base_hp', on: true });
    ack(h, { c: 'request', slot: 1, item: 'base_hp', on: true });
    ack(h, { c: 'request', slot: 1, item: 'archer_range', on: true });
    expect(w.team.wishlist).toHaveLength(3);
    ack(h, { c: 'request', slot: 1, item: 'archer_range', on: false });
    expect(w.team.wishlist).toHaveLength(2);
    h.sim.command({ c: 'buy', slot: 1, item: 'base_hp' });
    h.run(1);
    expect(h.events('purchase')).toEqual([{ e: 'purchase', slot: 1, item: 'base_hp', tier: 1 }]);
    expect(w.team.wishlist).toHaveLength(0);
    ack(h, { c: 'request', slot: 0, item: 'archer_range', on: true });
    h.toCombat();
    expect(w.team.wishlist).toHaveLength(0);
  });
});

describe('difficulty (§2.2): multipliers baked in at spawn', () => {
  it('Easy < Normal < Hard on wave budget and enemy HP, for the same seed', () => {
    const budgets: number[] = [];
    const hps: number[] = [];
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const h = harness(2, 42, { classes: ['ranger', 'warden'], difficulty: d });
      h.toBuild();
      h.sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: 9 });
      h.run(1);
      h.toCombat();
      let cost = 0;
      for (const g of h.sim.world.spawns) {
        const e = content.enemies.find((x) => x.id === g.enemy)!;
        cost += (e.budget * g.count) / (e.groupSize ?? 1);
      }
      budgets.push(cost);
      hps.push(h.sim.spawnEnemy('grunt', 10, 12).maxHp);
      expect(h.sim.world.settings.difficulty).toBe(d);
    }
    expect(budgets[0]).toBeLessThan(budgets[1]!);
    expect(budgets[1]).toBeLessThan(budgets[2]!);
    expect(hps[0]).toBeLessThan(hps[1]!);
    expect(hps[1]).toBeLessThan(hps[2]!);
  });
});
