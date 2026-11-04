// Team shop scenarios (SPEC §3.4, §3.5, §6.2, §10.3): visibility by team classes, Quartermaster-only
// items, tiers on every structure of a type (built ones too), snare charges on existing nets, rising
// repair, squad stats after regular waves, the wishlist and purchase announcements; and difficulty
// (§2.2) baked in at spawn.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import {
  PLAYER_COLOR_IDS,
  type ClassId,
  type PlayerColorId,
  type ShopItemId,
} from '../../../shared/ids';
import { teamView } from '../../net/views';
import { createParty } from '../../party';
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

function jump(h: Harness, wave: number) {
  h.sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave });
  h.run(1);
  h.sim.world.team.coins = 500;
}

describe('visibility (§6.2: shown only when the team can use it)', () => {
  it('no Engineer → no tower items; no Warden → no wall or net items; no Commander → no squad items', () => {
    const h = shopAt(['warden', 'quartermaster']);
    for (const id of ['arrow_rate', 'bomb_radius', 'tower_hp'] as const)
      expect(visible(h, id)).toBe(false);
    expect(visible(h, 'squad_stats')).toBe(false);
    for (const id of ['wall_hp', 'snare_charges', 'spiked_walls'] as const)
      expect(visible(h, id)).toBe(true);
    expect(ack(h, { c: 'buy', slot: 0, item: 'arrow_rate' }).reason).toBe('invalid');
    expect(ack(h, { c: 'request', slot: 0, item: 'tower_hp', on: true }).reason).toBe('invalid');

    const e = shopAt(['engineer', 'commander']);
    for (const id of ['arrow_rate', 'bomb_radius', 'tower_hp'] as const)
      expect(visible(e, id)).toBe(true);
    for (const id of ['wall_hp', 'snare_charges', 'spiked_walls'] as const)
      expect(visible(e, id)).toBe(false);
    for (const id of ['crate', 'repair', 'archer_damage', 'archer_range', 'archer_third'] as const)
      expect(visible(e, id)).toBe(true);
  });

  it('Quartermaster-only items go only to Quartermaster phones and only Quartermasters buy them', () => {
    const h = shopAt(['engineer', 'quartermaster']);
    const party = createParty<PlayerColorId, ClassId>({
      colors: [...PLAYER_COLOR_IDS],
      maxPlayers: 6,
    });
    const rows = teamView({
      party,
      content,
      settings: h.sim.world.settings,
      world: h.sim.world,
      summary: null,
    }).shop;
    const armor = rows.find((r) => r.id === 'base_armor')!;
    expect(armor.qmOnly).toBe(true);
    expect(armor.visible).toBe(true);
    // The phone's filter (controller/screens/build.ts): visible && (!qmOnly || Quartermaster).
    const shown = (cls: ClassId) =>
      rows.filter((r) => r.visible && (!r.qmOnly || cls === 'quartermaster')).map((r) => r.id);
    expect(shown('engineer')).not.toContain('base_armor');
    expect(shown('engineer')).not.toContain('emergency_kit');
    expect(shown('quartermaster')).toContain('base_armor');
    expect(shown('quartermaster')).toContain('emergency_kit');
    expect(ack(h, { c: 'buy', slot: 0, item: 'base_armor' }).reason).toBe('invalid');
    expect(ack(h, { c: 'buy', slot: 1, item: 'base_armor' }).ok).toBe(true);
    expect(h.sim.world.base.stats.damageReduction).toBeCloseTo(0.1);
    // Without a Quartermaster on the team they aren't shown at all.
    expect(visible(shopAt(['engineer']), 'base_armor')).toBe(false);
  });

  it('the emergency kit is held one at a time', () => {
    const h = shopAt(['quartermaster']);
    expect(ack(h, { c: 'buy', slot: 0, item: 'emergency_kit' }).ok).toBe(true);
    expect(h.p(0).kits).toBe(1);
    expect(ack(h, { c: 'buy', slot: 0, item: 'emergency_kit' }).reason).toBe('cap');
  });

  it('squad stats are sold only after regular waves, one tier per regular wave', () => {
    const h = shopAt(['commander']);
    expect(visible(h, 'squad_stats')).toBe(false); // before wave 1: no wave yet
    jump(h, 2);
    expect(visible(h, 'squad_stats')).toBe(true);
    expect(ack(h, { c: 'buy', slot: 0, item: 'squad_stats' }).ok).toBe(true);
    expect(visible(h, 'squad_stats')).toBe(false); // this regular wave's tier is bought
    jump(h, 6);
    expect(visible(h, 'squad_stats')).toBe(false); // after the wave 5 boss
    jump(h, 7);
    expect(visible(h, 'squad_stats')).toBe(true);
    const u = h.sim.world.soldiers.find((s) => s.owner === 0)!;
    const before = u.maxHp;
    ack(h, { c: 'buy', slot: 0, item: 'squad_stats' });
    expect(u.maxHp).toBeGreaterThan(before);
  });
});

describe('purchases', () => {
  it('prices rise per tier, tiers sell out, and big ones need a hold to confirm', () => {
    const h = shopAt(['engineer']);
    const prices: (number | null)[] = [];
    for (let i = 0; i < 4; i++) {
      prices.push(itemState(content, h.sim.world, item('arrow_rate')).price);
      ack(h, { c: 'buy', slot: 0, item: 'arrow_rate' });
    }
    expect(prices).toEqual([6, 10, 14, null]);
    expect(h.sim.world.team.shop.arrow_rate).toBe(3);
    expect(itemState(content, h.sim.world, item('archer_third')).holdToConfirm).toBe(true);
    expect(itemState(content, h.sim.world, item('crate')).holdToConfirm).toBe(false);
  });

  it('refuses without the coins, and outside the build phase', () => {
    const h = shopAt(['engineer'], 3);
    expect(ack(h, { c: 'buy', slot: 0, item: 'arrow_rate' }).reason).toBe('coins');
    h.toCombat();
    h.sim.world.team.coins = 100;
    expect(ack(h, { c: 'buy', slot: 0, item: 'arrow_rate' }).reason).toBe('phase');
  });

  it('building upgrades apply to every structure of the type, built ones and later ones', () => {
    const h = shopAt(['engineer']);
    const old = h.sim.place('arrow_tower', 10, 12, 0);
    const mortar = h.sim.place('bomb_tower', 12, 12, 0);
    ack(h, { c: 'buy', slot: 0, item: 'arrow_rate' });
    ack(h, { c: 'buy', slot: 0, item: 'tower_hp' });
    const later = h.sim.place('arrow_tower', 14, 12, 0);
    for (const t of [old, later]) {
      expect(t.mods.some((m) => m.id === 'shop:arrow_rate')).toBe(true);
      expect(t.maxHp).toBeCloseTo(250 * 1.25);
      expect(t.hp).toBeCloseTo(t.maxHp);
    }
    expect(mortar.maxHp).toBeCloseTo(220 * 1.25);
    expect(mortar.mods.some((m) => m.id === 'shop:arrow_rate')).toBe(false);
    ack(h, { c: 'buy', slot: 0, item: 'bomb_radius' });
    expect(mortar.mods.find((m) => m.id === 'shop:bomb_radius')?.stats).toEqual([
      { stat: 'radius', addPct: 0.15 },
    ]);
  });

  it('turret fire rate shortens the cooldown between shots', () => {
    const shots = (tier: number) => {
      const h = shopAt(['engineer']);
      for (let i = 0; i < tier; i++) ack(h, { c: 'buy', slot: 0, item: 'arrow_rate' });
      h.toCombat();
      h.holdSpawns();
      const t = h.sim.place('arrow_tower', 10, 12, 0);
      const e = h.sim.spawnEnemy('brute', 13, 12);
      e.hp = e.maxHp = 1e6;
      e.stats.moveSpeed = 0;
      return h.collect('attack', 600).filter((a) => a.source === t.id).length;
    };
    expect(shots(3)).toBeGreaterThan(shots(0));
  });

  it('snare charges raise the discharges of existing nets, and of new ones', () => {
    const h = shopAt(['warden']);
    const net = h.sim.place('snare', 10, 12, 0);
    expect(net.discharges).toBe(5);
    ack(h, { c: 'buy', slot: 0, item: 'snare_charges' });
    expect(net.discharges).toBe(7);
    ack(h, { c: 'buy', slot: 0, item: 'snare_charges' });
    expect(net.discharges).toBe(9);
    expect(h.sim.place('snare', 11, 12, 0).discharges).toBe(9);
  });

  it('wall HP tiers raise built walls; charged walls strike back at an attacker', () => {
    const h = shopAt(['warden']);
    const wall = h.sim.place('wall', 10, 12, 0);
    ack(h, { c: 'buy', slot: 0, item: 'wall_hp' });
    expect(wall.maxHp).toBeCloseTo(300 * 1.3);
    ack(h, { c: 'buy', slot: 0, item: 'spiked_walls' });
    h.toCombat();
    h.holdSpawns();
    // A sealed line: the Grunt has to smash a wall in its way.
    for (let col = 0; col < content.map!.cols; col++)
      if (col !== 10) h.sim.place('wall', col, 12, 0);
    const g = h.sim.spawnEnemy('grunt', 18.5, 18.5);
    g.hp = g.maxHp = 1e6;
    const strikes: Extract<SimEvent, { e: 'damage' }>[] = [];
    h.until(() => {
      strikes.push(...h.events('damage').filter((d) => d.target === g.id));
      return strikes.length > 0;
    }, 60 * 40);
    const wallIds = new Set(
      h.sim.world.structures.filter((s) => s.kind === 'wall').map((s) => s.id),
    );
    expect(wallIds.has(strikes[0]!.source!)).toBe(true);
    expect(strikes[0]!.amount).toBe(10);
    expect(g.hp).toBe(1e6 - 10);
  });

  it('repair restores base HP at a price that rises each purchase', () => {
    const h = shopAt(['engineer']);
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
    const h = shopAt(['engineer']);
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
    const h = shopAt(['engineer', 'engineer']);
    const w = h.sim.world;
    ack(h, { c: 'request', slot: 0, item: 'arrow_rate', on: true });
    ack(h, { c: 'request', slot: 1, item: 'arrow_rate', on: true });
    ack(h, { c: 'request', slot: 1, item: 'tower_hp', on: true });
    expect(w.team.wishlist).toHaveLength(3);
    ack(h, { c: 'request', slot: 1, item: 'tower_hp', on: false });
    expect(w.team.wishlist).toHaveLength(2);
    h.sim.command({ c: 'buy', slot: 1, item: 'arrow_rate' });
    h.run(1);
    expect(h.events('purchase')).toEqual([{ e: 'purchase', slot: 1, item: 'arrow_rate', tier: 1 }]);
    expect(w.team.wishlist).toHaveLength(0);
    ack(h, { c: 'request', slot: 0, item: 'tower_hp', on: true });
    h.toCombat();
    expect(w.team.wishlist).toHaveLength(0);
  });

  it("crates bought from the phone aren't announced (personal inventory)", () => {
    const h = shopAt(['engineer']);
    h.sim.command({ c: 'buy', slot: 0, item: 'crate' });
    h.run(1);
    expect(h.p(0).crates).toBe(1);
    expect(h.events('purchase')).toHaveLength(0);
  });
});

describe('difficulty (§2.2): multipliers baked in at spawn', () => {
  it('Easy < Normal < Hard on wave budget and enemy HP, for the same seed', () => {
    const budgets: number[] = [];
    const hps: number[] = [];
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const h = harness(2, 42, { classes: ['engineer', 'warden'], difficulty: d });
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
