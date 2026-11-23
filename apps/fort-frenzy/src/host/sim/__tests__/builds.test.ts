// Builds (SPEC §7, §15.3, §15.9 build rules; RD3): the meter, placement by input type, one active
// build per knight, HP builds as targets, builds between waves, the Warden's shield generator, the
// aim preview and the class damage band.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { beacon, classes, grunt, rallyFlag, shieldGen, warden } from '../../../content/balance';
import type { Content } from '../../../content';
import type { ClassId } from '../../../shared/ids';
import { buildBehaviors } from '../builds';
import { buildPreview } from '../preview';
import { AutopilotInputSource } from '../sources';
import type { ProjectileEnt } from '../types';
import { harness, type Harness } from './harness';

const steps = (ms: number) => Math.max(1, Math.round((ms * 60) / 1000));
const TANK = classes.find((c) => c.id === 'tank')!.damage;

function combat(cls: ClassId[] = ['warden'], c?: Content): Harness {
  const h = harness(cls.length, 1, { classes: cls, content: c });
  h.toCombat();
  h.holdSpawns();
  return h;
}

/** Content with the Warden's meter rates replaced. */
function wardenMeter(perSec: number, perPoint: number): Content {
  return {
    ...content,
    knights: content.knights.map((k) =>
      k.id === 'warden' ? { ...k, meter: { ...k.meter, perSec, perPoint } } : k,
    ),
  };
}

function tough(h: Harness, x: number, y: number) {
  const e = h.sim.spawnEnemy('grunt', x, y);
  e.hp = e.maxHp = 1e6;
  e.stats.moveSpeed = 0;
  return e;
}

/** One of our shots, tagged as `tags`, from `source` straight into the enemy at (x, y). */
function shot(source: number, x: number, y: number, amount: number, tags: string[]): ProjectileEnt {
  return {
    id: 99_999,
    x: x - 0.5,
    y,
    vx: 30,
    vy: 0,
    r: 0.12,
    side: 'ours',
    source,
    from: 'shield_gen',
    slot: 'attack',
    damage: amount,
    kind: 'area',
    tags,
    effects: [],
    hitsFlyers: true,
    pierce: 0,
    hit: [],
    expiresAt: 1e9,
    arc: null,
  };
}

const wardenBuilds = (h: Harness) => h.sim.world.builds.filter((b) => b.owner === 0);

describe('build meter (§7.2)', () => {
  it('starts the run full for every knight', () => {
    const h = harness(4, 1, { classes: ['warden', 'ranger', 'artificer', 'commander'] });
    for (const p of h.sim.world.players) expect(p.meter).toBe(1);
  });

  it('fills passively at meter.perSec in combat, never in the build phase', () => {
    const h = harness(1, 1, { classes: ['warden'] });
    h.toBuild();
    h.p(0).meter = 0;
    h.run(120);
    expect(h.p(0).meter).toBe(0);
    h.toCombat();
    h.holdSpawns();
    h.p(0).meter = 0;
    h.run(60);
    expect(h.p(0).meter).toBeCloseTo(warden.meter.perSec, 6);
  });

  it("doesn't fill while down or dazed", () => {
    const h = combat(['warden', 'warden']);
    h.p(0).meter = 0;
    h.p(0).hp = 0;
    h.p(1).meter = 0;
    h.sim.command({ c: 'presence', slot: 1, connected: false });
    h.run(60);
    expect(h.p(0).respawnAt).not.toBeNull();
    expect(h.p(0).meter).toBe(0);
    expect(h.p(1).meter).toBe(0);
  });

  it('fills from the knight’s own damage at meter.perPoint (his main)', () => {
    const h = combat(['warden'], wardenMeter(0, warden.meter.perPoint));
    h.put(0, 10, 12);
    tough(h, 11.2, 12);
    h.p(0).meter = 0;
    h.pads[0]!.tap('mainFires');
    h.run(steps(warden.main.windupMs!) + 2);
    expect(h.p(0).meter).toBeCloseTo(warden.main.damage * TANK * warden.meter.perPoint, 6);
  });

  it("a build's damage charges the super, never the meter", () => {
    const h = combat(['warden'], wardenMeter(0, warden.meter.perPoint));
    const p = h.p(0);
    p.meter = 0;
    p.superCharge = 0;
    tough(h, 12, 12);
    h.sim.world.projectiles.push(shot(p.id, 12, 12, 50, ['build']));
    h.run(2);
    expect(p.run.damageDealt).toBe(50);
    expect(p.meter).toBe(0);
    expect(p.superCharge).toBeCloseTo(50 * warden.superCharge.perDamage, 6);
  });

  it("a super's damage charges the meter (main and super damage, §7.2), never the super", () => {
    const h = combat(['warden'], wardenMeter(0, warden.meter.perPoint));
    const p = h.p(0);
    h.put(0, 10, 12);
    tough(h, 12, 12);
    p.meter = 0;
    p.superCharge = 1;
    h.pads[0]!.tap('superFires', { superAim: { x: 1, y: 0 } });
    h.run(steps(warden.super.windupMs!) + 2);
    const dealt = warden.super.damage * TANK;
    expect(p.run.damageDealt).toBe(dealt);
    expect(p.superCharge).toBe(0);
    expect(p.meter).toBeCloseTo(dealt * warden.meter.perPoint, 6);
  });

  it('carries over between waves', () => {
    const h = combat(['warden'], wardenMeter(0, warden.meter.perPoint));
    h.p(0).meter = 0.37;
    h.sim.world.spawns.length = 0;
    h.until(() => h.sim.world.phase === 'build', 5);
    expect(h.p(0).meter).toBeCloseTo(0.37, 9);
    h.toCombat();
    expect(h.p(0).meter).toBeCloseTo(0.37, 9);
  });
});

describe('placing a build (§7.1, §7.3)', () => {
  it('a full meter throws the shield generator along the aim; it flies, lands, then switches on', () => {
    const h = combat();
    h.put(0, 10, 12);
    h.pads[0]!.tap('buildFires', { buildAim: { x: 1, y: 0 } });
    h.run(1);
    const [b] = wardenBuilds(h);
    expect(b).toBeDefined();
    expect(h.events('buildPlaced')).toEqual([
      { e: 'buildPlaced', slot: 0, build: b!.id, kind: 'shield_gen' },
    ]);
    expect(h.p(0).meter).toBe(0);
    expect(h.p(0).run.buildsPlaced).toBe(1);
    expect(b!.state).toBe('flight');
    expect(b!.flight!.to).toEqual({ x: 10 + shieldGen.throw.range, y: 12 });
    const fly = Math.max(
      steps(shieldGen.throw.minFlightMs),
      Math.ceil((shieldGen.throw.range / shieldGen.throw.speed) * 60),
    );
    expect(b!.flight!.landsAt - b!.flight!.launchedAt).toBe(fly);
    // Not targetable in the air.
    const landed = h.collect('buildLanded', fly);
    expect(landed).toEqual([{ e: 'buildLanded', build: b!.id }]);
    expect(b!.state).toBe('landed');
    expect({ x: b!.x, y: b!.y }).toEqual({ x: 16, y: 12 });
    expect(b!.hp).toBe(shieldGen.hp);
    h.run(steps(shieldGen.armMs) + 1);
    expect(b!.state).toBe('active');
  });

  it('the shield generator flies 1 s at full range (RC1), then lands and arms on time', () => {
    expect(beacon.throw.speed).toBe(12);
    expect(rallyFlag.throw.speed).toBe(14);
    const h = combat();
    h.put(0, 10, 12);
    h.pads[0]!.set({ buildAiming: true, buildAim: { x: 1, y: 0 } });
    h.run(1);
    const pv = buildPreview(h.p(0), content)!;
    h.pads[0]!.tap('buildFires', { buildAiming: false });
    h.run(1);
    const [b] = wardenBuilds(h);
    const f = b!.flight!;
    expect(f.to).toEqual(pv.landing);
    expect(f.landsAt - f.launchedAt).toBe(steps(1000));
    expect(b!.liveAt).toBe(f.landsAt + steps(shieldGen.armMs));
    h.run(f.landsAt - h.sim.world.tick + 1);
    expect(b!.state).toBe('landed');
    expect({ x: b!.x, y: b!.y }).toEqual(pv.landing);
  });

  it('a quick tap (aim 0,0) lands at his feet; the stick’s length sets the distance', () => {
    const h = combat();
    h.put(0, 10, 12);
    h.pads[0]!.tap('buildFires', { buildAim: { x: 0, y: 0 } });
    h.run(1);
    expect(wardenBuilds(h)[0]!.flight!.to).toEqual({ x: 10, y: 12 });
    h.p(0).meter = 1;
    h.pads[0]!.tap('buildFires', { buildAim: { x: 0, y: 0.5 } });
    h.run(1);
    expect(wardenBuilds(h)[0]!.flight!.to).toEqual({ x: 10, y: 12 + shieldGen.throw.range / 2 });
  });

  it('lands on the field and outside the Citadel', () => {
    const h = combat();
    const map = content.map!;
    h.put(0, map.cols - 1, 12);
    h.pads[0]!.tap('buildFires', { buildAim: { x: 1, y: 0 } });
    h.run(1);
    expect(wardenBuilds(h)[0]!.flight!.to.x).toBeCloseTo(map.cols - shieldGen.bodyRadius, 9);
    // Thrown at the Citadel from just below it: pushed out of its footprint.
    h.p(0).meter = 1;
    h.put(0, 18, 4.5);
    h.pads[0]!.tap('buildFires', { buildAim: { x: 0, y: -1 } });
    h.run(1);
    const to = wardenBuilds(h)[0]!.flight!.to;
    const row = map.tiles[Math.floor(to.y)]!;
    expect(map.legend[row[Math.floor(to.x)]!]).not.toBe('citadel');
  });

  it('the TV preview shows the same landing, the build radius and the throw range', () => {
    const h = combat();
    h.put(0, 10, 12);
    h.pads[0]!.set({ buildAiming: true, buildAim: { x: 0.6, y: 0.8 } });
    h.run(1);
    const pv = buildPreview(h.p(0), content)!;
    expect(pv).toMatchObject({
      kind: 'shield_gen',
      from: { x: 10, y: 12 },
      radius: shieldGen.radius,
      range: shieldGen.throw.range,
    });
    h.pads[0]!.tap('buildFires', { buildAiming: false });
    h.run(1);
    expect(wardenBuilds(h)[0]!.flight!.to).toEqual(pv.landing);
    // Back in the dead zone (a release there cancels): no preview.
    h.pads[0]!.set({ buildAiming: true, buildAim: { x: 0.05, y: 0 } });
    h.run(1);
    expect(h.p(0).buildAim).toBeNull();
    expect(buildPreview(h.p(0), content)).toBeNull();
  });

  it('one active build per knight: a new one removes the old at the throw', () => {
    const h = combat();
    h.put(0, 10, 12);
    h.pads[0]!.tap('buildFires');
    h.run(40);
    const first = wardenBuilds(h)[0]!;
    h.p(0).meter = 1;
    h.pads[0]!.tap('buildFires', { buildAim: { x: 1, y: 0 } });
    h.run(1);
    expect(h.events('buildGone')).toEqual([
      { e: 'buildGone', build: first.id, kind: 'shield_gen', destroyed: false },
    ]);
    expect(wardenBuilds(h)).toHaveLength(1);
    expect(wardenBuilds(h)[0]!.id).not.toBe(first.id);
    expect(h.sim.world.builds.includes(first)).toBe(false);
  });

  it('no build in the build phase, none with the meter not full', () => {
    const h = harness(1, 1, { classes: ['warden'] });
    h.toBuild();
    h.pads[0]!.tap('buildFires');
    h.run(2);
    expect(h.sim.world.builds).toHaveLength(0);
    h.toCombat();
    h.holdSpawns();
    h.p(0).meter = 0.99;
    h.pads[0]!.tap('buildFires');
    h.run(2);
    expect(h.sim.world.builds).toHaveLength(0);
  });

  it('a build with no behavior yet does nothing (the meter stays full)', () => {
    const saved = buildBehaviors.mine;
    delete buildBehaviors.mine;
    try {
      const h = combat(['ranger']);
      h.pads[0]!.tap('buildFires');
      h.run(2);
      expect(h.sim.world.builds).toHaveLength(0);
      expect(h.p(0).meter).toBe(1);
    } finally {
      buildBehaviors.mine = saved;
    }
  });
});

describe('builds as targets (§7.3)', () => {
  /** A grunt with a Warden and a landed generator around it at the given offsets. */
  function scene(knight: [number, number], build: [number, number]) {
    const h = combat();
    const g = h.sim.spawnEnemy('grunt', 10, 10);
    h.put(0, 10 + knight[0], 10 + knight[1]);
    const b = h.sim.addBuild('shield_gen', 10 + build[0], 10 + build[1], 0);
    b.r = h.p(0).r; // equal radii, so equal offsets are an exact tie
    h.run(1);
    return { h, g, b };
  }

  it('an enemy picks the nearest of a knight and an HP build; a knight wins a tie', () => {
    const nearBuild = scene([2, 0], [0, 1.5]);
    expect(nearBuild.g.target).toBe(nearBuild.b.id);
    const nearKnight = scene([1.5, 0], [0, 2]);
    expect(nearKnight.g.target).toBe(nearKnight.h.p(0).id);
    const tie = scene([2, 0], [0, 2]);
    expect(tie.g.target).toBe(tie.h.p(0).id);
    expect(grunt.aggro.radius).toBeGreaterThanOrEqual(2);
  });

  it('it attacks the build (HP bar events) until it is destroyed', () => {
    const h = combat();
    h.put(0, 30, 20);
    const b = h.sim.addBuild('shield_gen', 10, 11, 0);
    b.hp = 15;
    h.sim.spawnEnemy('grunt', 10, 10.3);
    const hits: { e: string; hp?: number }[] = [];
    for (let i = 0; i < 300; i++) {
      h.sim.step();
      for (const e of h.sim.world.events)
        if (e.e === 'buildHp' || e.e === 'buildHit' || e.e === 'buildGone') hits.push(e);
    }
    expect(hits[0]).toEqual({ e: 'buildHit', build: b.id });
    expect(hits[1]).toEqual({
      e: 'buildHp',
      build: b.id,
      kind: 'shield_gen',
      owner: 0,
      hp: 5,
      maxHp: b.maxHp,
    });
    expect(hits[hits.length - 1]).toEqual({
      e: 'buildGone',
      build: b.id,
      kind: 'shield_gen',
      destroyed: true,
    });
    expect(h.sim.world.builds).toHaveLength(0);
  });

  it('builds in flight and charge builds (mines) are never targets', () => {
    const h = combat();
    h.put(0, 30, 20);
    const mine = h.sim.addBuild('mine', 10, 11, 0);
    const flying = h.sim.addBuild('shield_gen', 11, 10, 0);
    flying.state = 'flight';
    flying.flight = { from: { x: 11, y: 10 }, to: { x: 11, y: 10 }, launchedAt: 0, landsAt: 1e9 };
    const g = h.sim.spawnEnemy('grunt', 10, 10);
    h.run(5);
    expect(g.target).not.toBe(mine.id);
    expect(g.target).not.toBe(flying.id);
    expect(g.ai).not.toBe('aggro');
  });

  it('a build stays between waves with its HP; builds never regen', () => {
    const h = combat();
    h.put(0, 10, 12);
    h.pads[0]!.tap('buildFires');
    h.run(60);
    const b = wardenBuilds(h)[0]!;
    b.hp = 123;
    h.sim.world.spawns.length = 0;
    h.until(() => h.sim.world.phase === 'build', 5);
    h.run(600);
    expect(wardenBuilds(h)).toEqual([b]);
    expect(b.hp).toBe(123);
    h.toCombat();
    h.run(60);
    expect(wardenBuilds(h)[0]!.id).toBe(b.id);
    expect(b.hp).toBe(123);
  });
});

describe('shield generator (§7.4)', () => {
  it('guards knights and soldiers in its radius in combat; not itself, not in the build phase', () => {
    const h = combat(['warden', 'commander']);
    const b = h.sim.addBuild('shield_gen', 10, 12, 0);
    h.put(0, 10 + shieldGen.radius - 0.5, 12);
    h.put(1, 10 + shieldGen.radius + 1, 12);
    const soldier = h.sim.addSoldier(1, 10, 12.5);
    h.run(2);
    const guard = (u: { effects: { def: string; strength: number }[] }) =>
      u.effects.find((e) => e.def === 'guard')?.strength;
    expect(guard(h.p(0))).toBeCloseTo(shieldGen.guard, 9);
    expect(guard(soldier)).toBeCloseTo(shieldGen.guard, 9);
    expect(guard(h.p(1))).toBeUndefined();
    expect(guard(b)).toBeUndefined();
    // Build phase: the field stands idle and the guard runs out.
    h.sim.world.spawns.length = 0;
    h.until(() => h.sim.world.phase === 'build', 5);
    h.run(30);
    expect(guard(h.p(0))).toBeUndefined();
  });

  it('cuts damage taken by its guard, after the capped card reduction', () => {
    const hit = (withGen: boolean, toughness: number) => {
      const h = harness(1, 1, { classes: ['warden'] });
      h.toBuild();
      if (toughness > 0) h.give(0, 'toughness', toughness);
      h.toCombat();
      h.holdSpawns();
      h.put(0, 10, 12);
      if (withGen) h.sim.addBuild('shield_gen', 11, 12, 0);
      h.sim.spawnEnemy('grunt', 10, 12.7);
      const d = h.collect('damage', 120).find((x) => x.target === h.p(0).id && x.amount > 0);
      return d!.amount;
    };
    const base = hit(false, 0);
    expect(base).toBe(grunt.attack.damage);
    expect(hit(true, 0)).toBeCloseTo(base * (1 - shieldGen.guard), 6);
    // Toughness capped at 0.4, then the guard on top, outside the cap.
    expect(hit(true, 10)).toBeCloseTo(base * 0.6 * (1 - shieldGen.guard), 6);
  });

  it('where generators overlap the strongest guard wins', () => {
    const h = combat(['warden', 'warden']);
    h.p(1).mods.push({
      id: 'test:power',
      stats: [{ stat: 'buildPower', addPct: 0.5, scope: 'build' }],
    });
    h.sim.addBuild('shield_gen', 10, 12, 0);
    h.sim.addBuild('shield_gen', 11, 12, 1);
    h.put(0, 10.5, 12);
    h.run(2);
    const guards = h.p(0).effects.filter((e) => e.def === 'guard');
    expect(guards).toHaveLength(1);
    expect(guards[0]!.strength).toBeCloseTo(shieldGen.guard * 1.5, 9);
  });
});

describe('Warden jump slam (§8.2)', () => {
  it('stays a target while airborne; lands as wide as the slam, longer, with less damage', () => {
    expect(warden.super.arcDeg).toBe(warden.main.arcDeg);
    expect(warden.super.range).toBeGreaterThan(warden.main.range);
    expect(warden.super.damage).toBeLessThan(warden.main.damage);
    const h = combat();
    h.put(0, 10, 12);
    h.p(0).superCharge = 1;
    h.pads[0]!.tap('superFires', { superAim: { x: 1, y: 0 } });
    h.run(1);
    expect(h.p(0).super.windupEndsAt).not.toBeNull();
    const g = h.sim.spawnEnemy('grunt', 10, 10.5);
    h.run(1);
    expect(g.target).toBe(h.p(0).id);
  });
});

describe('autopilot builds (§15.9)', () => {
  it('the Warden autopilot throws its generator once a fight is in range', () => {
    const h = harness(1, 3, { classes: ['warden'] });
    h.sim.setSource(0, new AutopilotInputSource(() => h.sim.world, 0));
    h.toCombat();
    let placed = 0;
    for (let i = 0; i < 60 * 40 && h.sim.world.phase === 'combat'; i++) {
      h.sim.step();
      placed += h.events('buildPlaced').length;
    }
    expect(placed).toBeGreaterThan(0);
  });
});
