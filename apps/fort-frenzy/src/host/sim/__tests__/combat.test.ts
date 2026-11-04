// Combat scenarios: the Engineer's kit (SPEC §8, §10.1), the pulse turret, base archers (§3.5), the
// Grunt (§9, aggro leash), dazed (§11.3), death and respawn (§5), danger markers, invincible (§9.5).
import { describe, expect, it } from 'vitest';
import { arrowTower, base as baseDef, engineer, grunt } from '../../../content/balance';
import { harness } from './harness';

const MAIN = engineer.main.damage;

function combat(players = 1) {
  const h = harness(players);
  h.toCombat();
  h.holdSpawns();
  return h;
}

/** A barely moving stick breaks Steady Aim, so shots deal their base damage. */
function unsteady(h: ReturnType<typeof harness>) {
  h.pads[0]!.set({ move: { x: 0.001, y: 0 } });
  h.run(1);
}

describe('Engineer longbow', () => {
  it('fires on release in the aimed direction and hits what it points at', () => {
    const h = combat();
    h.put(0, 10, 16);
    unsteady(h);
    const g = h.sim.spawnEnemy('grunt', 10, 11);
    const miss = h.sim.spawnEnemy('grunt', 14, 16);
    h.pads[0]!.tap('mainFires', { mainAim: { x: 0, y: -1 } });
    h.run(1);
    expect(h.events('attack')).toEqual([expect.objectContaining({ slot: 'main' })]);
    expect(h.sim.world.projectiles).toHaveLength(1);
    h.run(30);
    expect(g.maxHp - g.hp).toBe(MAIN);
    expect(miss.hp).toBe(miss.maxHp);
    expect(h.p(0).run.damageDealt).toBe(MAIN);
  });

  it('a tap (aim 0,0) auto-aims at the nearest enemy in range', () => {
    const h = combat();
    h.put(0, 10, 16);
    unsteady(h);
    const far = h.sim.spawnEnemy('grunt', 10, 10);
    const near = h.sim.spawnEnemy('grunt', 14, 16);
    h.pads[0]!.tap('mainFires', { mainAim: { x: 0, y: 0 } });
    h.run(30);
    expect(near.hp).toBe(near.maxHp - MAIN);
    expect(far.hp).toBe(far.maxHp);
  });

  it('a release during the cooldown fires as soon as it ends; holding never repeats', () => {
    const h = combat();
    h.put(0, 10, 16);
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    h.run(1);
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    const cd = Math.round((engineer.main.cooldownMs / 1000) * 60);
    const shots = h.collect('attack', cd + 30);
    expect(shots).toHaveLength(1);
    expect(h.sim.world.tick).toBeGreaterThan(cd);
  });

  it('dealing damage charges the super', () => {
    const h = combat();
    h.put(0, 10, 16);
    unsteady(h);
    h.sim.spawnEnemy('grunt', 13, 16);
    h.pads[0]!.tap('mainFires');
    h.run(30);
    expect(h.p(0).superCharge).toBeCloseTo(MAIN * engineer.superChargeRate, 6);
  });
});

describe('Engineer super', () => {
  it('needs a full charge, then damages and knocks back everything in the circle', () => {
    const h = combat();
    h.put(0, 10, 16);
    const a = h.sim.spawnEnemy('grunt', 11.5, 16);
    const b = h.sim.spawnEnemy('grunt', 10, 18);
    const out = h.sim.spawnEnemy('grunt', 15, 16);
    h.pads[0]!.tap('superFires');
    h.run(1);
    expect(a.hp).toBe(a.maxHp);

    h.p(0).superCharge = 1;
    const ax = a.x;
    h.pads[0]!.tap('superFires');
    h.run(1);
    expect(a.hp).toBe(a.maxHp - engineer.super.damage);
    expect(b.hp).toBe(b.maxHp - engineer.super.damage);
    expect(out.hp).toBe(out.maxHp);
    expect(h.p(0).superCharge).toBe(0);
    h.run(30);
    expect(a.x - ax).toBeGreaterThan(engineer.super.knockback! * 0.7);
  });

  it('announces a full super once', () => {
    const h = combat();
    h.put(0, 10, 16);
    h.p(0).superCharge = 0.99;
    h.sim.spawnEnemy('grunt', 13, 16);
    h.pads[0]!.tap('mainFires');
    expect(h.collect('superReady', 30)).toEqual([{ e: 'superReady', slot: 0 }]);
    expect(h.p(0).superCharge).toBe(1);
  });
});

describe('Steady Aim', () => {
  const still = Math.round((600 / 1000) * 60) + 2;

  it('standing still boosts damage', () => {
    const h = combat();
    h.put(0, 10, 16);
    const g = h.sim.spawnEnemy('grunt', 14, 16);
    h.run(still);
    h.pads[0]!.tap('mainFires');
    h.run(30);
    expect(g.maxHp - g.hp).toBeCloseTo(MAIN * 1.25, 6);
  });

  it('standing still boosts range (auto-aim reaches further)', () => {
    const range = engineer.main.range;
    for (const moving of [false, true]) {
      const h = combat();
      h.put(0, 10, 18);
      const g = h.sim.spawnEnemy('grunt', 10, 18 - range - 1);
      g.stats.moveSpeed = 0;
      if (moving) h.pads[0]!.set({ move: { x: 0.01, y: 0 } });
      h.run(still);
      h.pads[0]!.tap('mainFires');
      h.run(40);
      if (moving) expect(g.hp).toBe(g.maxHp);
      else expect(g.hp).toBeLessThan(g.maxHp);
    }
  });
});

describe('pulse turret and base archers', () => {
  it('the turret shoots the nearest enemy in range', () => {
    const h = combat();
    h.put(0, 30, 4);
    h.sim.place('arrow_tower', 10, 14, 0);
    const near = h.sim.spawnEnemy('grunt', 10.5, 18);
    const far = h.sim.spawnEnemy('grunt', 14.5, 18.5);
    near.stats.moveSpeed = far.stats.moveSpeed = 0;
    h.run(20);
    expect(near.hp).toBe(near.maxHp - arrowTower.attack.damage);
    expect(far.hp).toBe(far.maxHp);
  });

  it('archers shoot the nearest enemy in range, flyers included', () => {
    const h = combat();
    h.put(0, 30, 4);
    const fly = h.sim.spawnEnemy('grunt', 18, 5);
    fly.flying = true;
    fly.stats.moveSpeed = 0;
    const other = h.sim.spawnEnemy('grunt', 25, 6);
    other.stats.moveSpeed = 0;
    h.run(25);
    expect(fly.hp).toBeLessThan(fly.maxHp);
    expect(other.hp).toBe(other.maxHp);
    expect(h.sim.world.base.archers.count).toBe(baseDef.archers.count);
  });
});

describe('Grunt', () => {
  it('walks to the base and hits it; the base keeps its damage stage and alarm as state', () => {
    const h = combat();
    h.put(0, 30, 10);
    const b = h.sim.world.base;
    const g = h.sim.spawnEnemy('grunt', 18, 4);
    g.hp = g.maxHp = 1e6; // outlives the archers
    h.until(() => b.hp < b.maxHp, 600);
    expect(b.maxHp - b.hp).toBe(grunt.attack.damage);
    expect(h.events('baseHit')).toEqual([{ e: 'baseHit', amount: grunt.attack.damage, hp: b.hp }]);
    expect(b.stage).toBe(0);
    b.hp = b.maxHp * 0.5;
    h.run(1);
    expect(b.stage).toBe(1);
    b.hp = b.maxHp * 0.3;
    h.run(1);
    expect(b.stage).toBe(2);
    expect(h.events('baseAlarm')).toEqual([]);
    b.hp = b.maxHp * 0.25 + 5;
    h.until(() => h.events('baseAlarm').length > 0, 200);
    expect(b.alarm).toBe(true);
    b.hp = b.maxHp * 0.05;
    h.run(1);
    expect(b.stage).toBe(3);
  });

  it('aggro: leaves the path for a nearby player, hits them, and returns past the leash', () => {
    const h = combat();
    const g = h.sim.spawnEnemy('grunt', 10.5, 14.5);
    h.put(0, 11.5, 14.5);
    h.until(() => h.p(0).hp < h.p(0).maxHp, 200);
    expect(g.ai).toBe('aggro');
    expect(g.target).toBe(h.p(0).id);
    // Run away past the leash.
    h.put(0, 30, 20);
    h.until(() => g.ai === 'path', 60 * 10);
    expect(g.target).toBeNull();
  });

  it('a dazed (disconnected) player is untargetable and drops their crates', () => {
    const h = combat();
    h.put(0, 11, 14.5);
    h.p(0).crates = 2;
    h.sim.command({ c: 'presence', slot: 0, connected: false });
    const g = h.sim.spawnEnemy('grunt', 10.5, 14.5);
    h.run(120);
    expect(h.p(0).hp).toBe(h.p(0).maxHp);
    expect(g.ai).toBe('path');
    expect(h.p(0).crates).toBe(0);
    expect(h.sim.world.cratePiles).toEqual([expect.objectContaining({ n: 2 })]);
    expect(h.p(0).connected).toBe(false);
  });

  it('a chasing Grunt drops a target that goes dazed', () => {
    const h = combat();
    const g = h.sim.spawnEnemy('grunt', 10.5, 14.5);
    h.put(0, 11.5, 14.5);
    h.until(() => g.ai === 'aggro', 100);
    h.sim.command({ c: 'presence', slot: 0, connected: false });
    h.run(2);
    expect(g.target).not.toBe(h.p(0).id);
  });
});

describe('death, respawn, invincible, danger markers', () => {
  it('a dead player respawns at the base after 10 s', () => {
    const h = combat();
    h.put(0, 10, 14);
    h.p(0).hp = 1;
    h.sim.spawnEnemy('grunt', 10.5, 14);
    h.until(() => h.p(0).respawnAt !== null, 300);
    const died = h.sim.world.tick;
    h.until(() => h.p(0).respawnAt === null, 60 * 12);
    expect(h.sim.world.tick - died).toBeGreaterThanOrEqual(600 - 1);
    expect(h.sim.world.tick - died).toBeLessThanOrEqual(600 + 1);
    expect(h.p(0).hp).toBe(h.p(0).maxHp);
    expect(h.p(0).y).toBeLessThan(5);
  });

  it('invincible players take no damage', () => {
    const h = combat();
    h.sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
    h.put(0, 10, 14);
    h.sim.spawnEnemy('grunt', 10.5, 14);
    h.run(300);
    expect(h.p(0).hp).toBe(h.p(0).maxHp);
    expect(h.p(0).invincible).toBe(true);
  });

  it('a danger marker lands on its tick and hits what is inside', () => {
    const h = combat(2);
    h.put(0, 10, 14);
    h.put(1, 20, 14);
    const w = h.sim.world;
    w.markers.push({
      id: w.nextId++,
      source: 0,
      shape: 'circle',
      x: 10,
      y: 14,
      r: 2,
      createdAt: w.tick,
      landsAt: w.tick + 30,
      payload: { damage: 20, kind: 'area', tags: [], hitsStructures: false },
    });
    h.run(29);
    expect(h.p(0).hp).toBe(h.p(0).maxHp);
    h.run(2);
    expect(h.p(0).hp).toBe(h.p(0).maxHp - 20);
    expect(h.p(1).hp).toBe(h.p(1).maxHp);
    expect(w.markers).toHaveLength(0);
  });
});
