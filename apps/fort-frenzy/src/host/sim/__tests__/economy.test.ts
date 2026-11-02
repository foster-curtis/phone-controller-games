// Economy scenarios (SPEC §3.4, §5, §6, §10.1 action rows 1–4, give/drop).
import { describe, expect, it } from 'vitest';
import { base as baseDef, rules } from '../../../content/base';
import { engineer } from '../../../content/characters';
import { harness } from './harness';

const DEPOT = { x: 22.5, y: 1.5 };
const REPAIR = { x: 18, y: 2.5 };
const PRICE = 2;

describe('depot, carry cap, slowdown', () => {
  it('buys crates at the depot for team coins, up to the carry cap', () => {
    const h = harness(1);
    h.toBuild();
    h.sim.world.team.coins = 100;
    h.put(0, DEPOT.x, DEPOT.y);
    const buys = [];
    for (let i = 0; i < 6; i++) {
      h.pads[0]!.tap('actionTaps');
      h.run(1);
      buys.push(...h.events('crate').filter((e) => e.action === 'buy'));
    }
    expect(h.p(0).crates).toBe(engineer.carryCap);
    expect(buys).toHaveLength(engineer.carryCap);
    expect(h.sim.world.team.coins).toBe(100 - engineer.carryCap * PRICE);
  });

  it("doesn't buy without the coins", () => {
    const h = harness(1);
    h.toBuild();
    h.sim.world.team.coins = PRICE - 1;
    h.put(0, DEPOT.x, DEPOT.y);
    h.pads[0]!.tap('actionTaps');
    h.run(1);
    expect(h.p(0).crates).toBe(0);
    expect(h.sim.world.team.coins).toBe(PRICE - 1);
  });

  it('buys in combat too', () => {
    const h = harness(1);
    h.toCombat();
    h.holdSpawns();
    h.sim.world.team.coins = 10;
    h.put(0, DEPOT.x, DEPOT.y);
    h.pads[0]!.tap('actionTaps');
    h.run(1);
    expect(h.p(0).crates).toBe(1);
  });

  it('carry slowdown grows faster than linearly with crates carried', () => {
    const dist: number[] = [];
    for (let n = 0; n <= engineer.carryCap; n++) {
      const h = harness(1);
      h.toBuild();
      h.put(0, 4, 10);
      h.p(0).crates = n;
      h.pads[0]!.set({ move: { x: 1, y: 0 } });
      h.run(60);
      dist.push(h.p(0).x - 4);
    }
    expect(dist[0]).toBeCloseTo(engineer.moveSpeed, 1);
    for (let n = 1; n < dist.length; n++) expect(dist[n]).toBeLessThan(dist[n - 1]!);
    const loss = dist.map((d, n) => (n === 0 ? 0 : dist[n - 1]! - d));
    for (let n = 2; n < loss.length; n++) expect(loss[n]).toBeGreaterThan(loss[n - 1]!);
    expect(dist[1]! / dist[0]!).toBeGreaterThan(0.94); // barely noticeable
    expect(dist[engineer.carryCap]! / dist[0]!).toBeLessThan(0.75); // a real slowdown
  });
});

describe('give and drop', () => {
  it('gives one crate to the nearest teammate in reach with room', () => {
    const h = harness(3);
    h.toBuild();
    h.put(0, 10, 10);
    h.put(1, 10.8, 10); // nearest, but full
    h.put(2, 11.5, 10);
    h.p(0).crates = 2;
    h.p(1).crates = engineer.carryCap;
    h.sim.command({ c: 'give', slot: 0, ref: 5 });
    h.run(1);
    expect(h.p(0).crates).toBe(1);
    expect(h.p(1).crates).toBe(engineer.carryCap);
    expect(h.p(2).crates).toBe(1);
    expect(h.events('crate')).toEqual([expect.objectContaining({ action: 'give', slot: 0, to: 2 })]);
    expect(h.events('command')).toEqual([{ e: 'command', ref: 5, slot: 0, ok: true }]);
    expect(h.p(0).run.cratesGiven).toBe(1);
  });

  it('drops the crate at your feet when nobody is in reach', () => {
    const h = harness(2);
    h.toBuild();
    h.put(0, 10, 10);
    h.put(1, 10 + rules.giveRadius + 2, 10);
    h.p(0).crates = 1;
    h.sim.command({ c: 'give', slot: 0 });
    h.run(1);
    expect(h.p(0).crates).toBe(0);
    expect(h.p(1).crates).toBe(0);
    expect(h.sim.world.cratePiles).toEqual([
      expect.objectContaining({ x: 10, y: 10, n: 1, lockedSlot: 0 }),
    ]);
    expect(h.events('crate')).toEqual([expect.objectContaining({ action: 'drop', to: null })]);
  });

  it('gives through the build arc (Give, radial slot 3) in combat', () => {
    const h = harness(2);
    h.toCombat();
    h.holdSpawns();
    h.put(0, 10, 10);
    h.put(1, 11, 10);
    h.p(0).crates = 2;
    h.pads[0]!.tap('radialCommits', { radialSlot: 3 });
    h.run(1);
    expect(h.p(0).crates).toBe(1);
    expect(h.p(1).crates).toBe(1);
  });

  it('refuses a give with no crates', () => {
    const h = harness(1);
    h.toBuild();
    h.sim.command({ c: 'give', slot: 0, ref: 1 });
    h.run(1);
    expect(h.events('command')).toEqual([
      { e: 'command', ref: 1, slot: 0, ok: false, reason: 'crates' },
    ]);
  });

  it('a dropped crate is locked to its dropper for ~1 s; others can take it at once', () => {
    const h = harness(2);
    h.toBuild();
    h.put(0, 10, 10);
    h.put(1, 20, 10);
    h.p(0).crates = 1;
    h.sim.command({ c: 'give', slot: 0 });
    h.run(1);
    // A following tap does its normal action instead of grabbing it back.
    h.pads[0]!.tap('actionTaps');
    h.run(1);
    expect(h.p(0).crates).toBe(0);
    h.run(Math.round((rules.dropLockMs / 1000) * 60) - 3);
    h.pads[0]!.tap('actionTaps');
    h.run(1);
    expect(h.p(0).crates).toBe(0);
    h.run(2);
    h.pads[0]!.tap('actionTaps');
    h.run(1);
    expect(h.p(0).crates).toBe(1);
    expect(h.sim.world.cratePiles).toHaveLength(0);

    // Another player can pick up a fresh drop straight away.
    h.sim.command({ c: 'give', slot: 0 });
    h.run(1);
    h.put(1, 10.3, 10);
    h.pads[1]!.tap('actionTaps');
    h.run(1);
    expect(h.p(1).crates).toBe(1);
  });

  it('picks up only as many as fit', () => {
    const h = harness(1);
    h.toBuild();
    h.put(0, 10, 10);
    h.p(0).crates = 3;
    h.sim.world.cratePiles.push({
      id: h.sim.world.nextId++,
      x: 10.4,
      y: 10,
      n: 3,
      lockedSlot: null,
      lockedUntil: 0,
    });
    h.pads[0]!.tap('actionTaps');
    h.run(1);
    expect(h.p(0).crates).toBe(engineer.carryCap);
    expect(h.sim.world.cratePiles[0]!.n).toBe(2);
  });
});

describe('repair and death drops', () => {
  it('delivering a crate in the repair zone repairs the base', () => {
    const h = harness(1);
    h.toBuild();
    const b = h.sim.world.base;
    b.hp = 500;
    h.put(0, REPAIR.x, REPAIR.y);
    h.p(0).crates = 2;
    h.pads[0]!.tap('actionTaps');
    h.run(1);
    expect(b.hp).toBe(500 + baseDef.repairPerCrate);
    expect(h.p(0).crates).toBe(1);
    expect(h.p(0).run.cratesDelivered).toBe(1);
    expect(h.events('crate')).toEqual([expect.objectContaining({ action: 'deliver' })]);
  });

  it('repair never goes past max HP, and a full base takes no crate', () => {
    const h = harness(1);
    h.toBuild();
    const b = h.sim.world.base;
    b.hp = b.maxHp - 10;
    h.put(0, REPAIR.x, REPAIR.y);
    h.p(0).crates = 2;
    h.pads[0]!.tap('actionTaps');
    h.run(1);
    expect(b.hp).toBe(b.maxHp);
    h.pads[0]!.tap('actionTaps');
    h.run(1);
    expect(h.p(0).crates).toBe(1);
  });

  it('a player who dies drops every crate they carried', () => {
    const h = harness(1);
    h.toCombat();
    h.holdSpawns();
    h.put(0, 10, 12);
    const p = h.p(0);
    p.crates = 3;
    p.hp = 5;
    h.sim.spawnEnemy('grunt', 10, 12.6);
    h.until(() => p.respawnAt !== null, 600);
    expect(p.crates).toBe(0);
    expect(h.sim.world.cratePiles).toEqual([expect.objectContaining({ n: 3, lockedSlot: null })]);
    expect(p.run.deaths).toBe(1);
  });
});
