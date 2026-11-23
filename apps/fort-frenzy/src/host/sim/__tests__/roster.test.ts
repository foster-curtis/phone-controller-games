// RD10 roster scenarios (SPEC §9, §9.2, §15.5): the Brute hunting builds, Siege priority, the Hunter's
// priced stalk and lock-on sprint, Flyer rules, the per-wave enemy multiplier, the Colossus's move set
// by Mk and the Charge, plus answered-by spot checks. Mines are tested both as `addBuild` trait
// fixtures and as real placed mines (RD7); the rally flag's traits come through a fixture.
import { describe, expect, it } from 'vitest';
import { content as baseContent, type Content } from '../../../content';
import {
  colossus as colossusDef,
  flyer as flyerDef,
  grunt as gruntDef,
  hunter as hunterDef,
  mine as mineDef,
  ranger as rangerDef,
  siege as siegeDef,
} from '../../../content/balance';
import type { ClassId } from '../../../shared/ids';
import { tuning } from '../boss/colossus';
import { BASE_ID, type BuildEnt, type EnemyEnt, type SoldierEnt } from '../types';
import { harness, type Harness, type HarnessOptions } from './harness';

const T = tuning(colossusDef);

/** Combat of wave `n` with nothing spawning, no sentries, players parked in the top corners. */
function arena(classes: ClassId[] = ['ranger'], n = 1, o: HarnessOptions = {}): Harness {
  const h = harness(classes.length, 3, { ...o, classes });
  if (n !== 1) {
    h.sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: n });
    h.run(1);
  }
  h.toCombat();
  h.holdSpawns(); // combat stays open with nothing coming
  h.sim.world.base.archers.count = 0;
  park(h);
  return h;
}

function park(h: Harness) {
  h.sim.world.players.forEach((p, i) => h.put(p.slot, i % 2 === 0 ? 1 : 35, 1 + i * 0.5));
}

/** A lone Colossus in wave `n`, its escorts removed, with its next attacks held off. */
function lone(
  n: number,
  x: number,
  y: number,
  classes: ClassId[] = ['ranger', 'ranger'],
): { h: Harness; b: EnemyEnt } {
  const h = arena(classes, n);
  h.sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
  h.run(1);
  park(h);
  const b = h.sim.spawnEnemy('colossus', x, y);
  for (const e of h.sim.world.enemies) if (e !== b) e.hp = 0;
  b.boss!.ready = { slam: 1e9, boulder: 1e9, charge: 1e9, call: 1e9 };
  h.run(1);
  return { h, b };
}

/** A real mine (RD7) through slot 0's build press at (x, y), armed; the Ranger stays there. */
function placeMine(h: Harness, x: number, y: number): BuildEnt {
  h.put(0, x, y);
  h.p(0).meter = 1;
  h.pads[0]!.tap('buildFires');
  h.run(1);
  const mine = h.sim.world.builds.find((b) => b.kind === 'mine')!;
  h.until(() => mine.state === 'active', 120);
  return mine;
}

/** The real rally flag (RD9) through slot 0's build press, landed at his feet at (x, y). */
function placeFlag(h: Harness, x: number, y: number): BuildEnt {
  h.put(0, x, y);
  h.p(0).meter = 1;
  h.pads[0]!.tap('buildFires');
  h.run(1);
  const flag = h.sim.world.builds.find((b) => b.kind === 'rally_flag')!;
  h.until(() => flag.state !== 'flight', 120);
  return flag;
}

describe('Brute (build hunter)', () => {
  it('picks the nearest targetable build at any distance and walks to it', () => {
    const h = arena(['warden']);
    const far = h.sim.addBuild('shield_gen', 33, 22, 0);
    const near = h.sim.addBuild('shield_gen', 22, 20, 0);
    const b = h.sim.spawnEnemy('brute', 3, 20);
    h.run(2);
    expect(b.huntBuild).toBe(near.id);
    expect(b.ai).toBe('hunt');
    expect(b.huntSince).toBeDefined();
    // Its field is keyed by the build's tile.
    expect(h.sim.world.fields.brute[20 * 36 + 22]).toBeDefined();
    const d0 = Math.hypot(near.x - b.x, near.y - b.y);
    h.run(120);
    expect(Math.hypot(near.x - b.x, near.y - b.y)).toBeLessThan(d0 - 1);
    expect(far.hp).toBe(far.maxHp);
  });

  it('a build landing nearer pulls it off course and re-flashes the lock-on', () => {
    const h = arena(['warden']);
    const first = h.sim.addBuild('shield_gen', 30, 20, 0);
    const b = h.sim.spawnEnemy('brute', 10, 20);
    h.run(2);
    expect(b.huntBuild).toBe(first.id);
    const lock = b.huntSince!;
    h.run(3);
    const bait = h.sim.addBuild('shield_gen', 12, 20, 0);
    h.run(1);
    expect(b.huntBuild).toBe(bait.id);
    expect(b.huntSince!).toBeGreaterThan(lock);
  });

  it('destroys it, takes the next, and falls back to Grunt behavior after the last', () => {
    const h = arena(['warden']);
    const one = h.sim.addBuild('shield_gen', 18, 14, 0);
    const two = h.sim.addBuild('shield_gen', 24, 14, 0);
    const b = h.sim.spawnEnemy('brute', 17, 14);
    h.until(() => one.hp < one.maxHp, 60 * 5);
    one.hp = 0;
    h.run(2);
    expect(h.sim.world.builds).not.toContain(one);
    expect(b.huntBuild).toBe(two.id);
    two.hp = 0;
    h.run(2);
    expect(h.sim.world.builds).toHaveLength(0);
    expect(b.huntBuild).toBeUndefined();
    expect(b.huntSince).toBeUndefined();
    expect(b.ai).not.toBe('hunt');
    // The per-build fields go with the builds.
    expect(Object.keys(h.sim.world.fields.brute)).toHaveLength(0);
    h.until(() => b.ai === 'attack' && b.target === BASE_ID, 60 * 40);
  });

  it('never hunts a mine or the rally flag', () => {
    const h = arena(['warden']);
    h.sim.addBuild('mine', 12, 20, 0);
    h.sim.addBuild('rally_flag', 14, 20, 0);
    const b = h.sim.spawnEnemy('brute', 10, 20);
    h.run(10);
    expect(b.huntBuild).toBeUndefined();
    expect(b.ai).toBe('path');
  });
});

describe('Siege priority (base > players > builds, #108)', () => {
  it('walks until something is in range, then shells it from where it stands', () => {
    const h = arena(['warden']);
    const s = h.sim.spawnEnemy('siege', 18, 22);
    h.run(10);
    expect(s.ai).toBe('path');
    expect(Math.hypot(s.vx, s.vy)).toBeGreaterThan(0);
    const build = h.sim.addBuild('shield_gen', 18, 17, 0);
    h.run(2);
    expect(s.target).toBe(build.id);
    expect(s.ai).toBe('siege');
    expect(Math.hypot(s.vx, s.vy)).toBe(0);
  });

  it('prefers a player to a build, and the base to a player, nearest within each', () => {
    const h = arena(['warden', 'ranger']);
    const s = h.sim.spawnEnemy('siege', 18, 16);
    h.sim.addBuild('shield_gen', 18, 18, 0);
    h.run(2);
    h.put(0, 22, 16);
    h.put(1, 14.5, 16);
    h.run(1);
    expect(s.target).toBe(h.p(1).id); // the nearer knight
    s.y = 8; // the Citadel in range now
    h.run(1);
    expect(s.target).toBe(BASE_ID);
  });

  it('retargets the moment a higher-priority target enters range, even mid wind-up', () => {
    const h = arena(['warden']);
    const s = h.sim.spawnEnemy('siege', 18, 16);
    const build = h.sim.addBuild('shield_gen', 18, 18, 0);
    h.until(() => s.attack.windupEndsAt !== null, 60);
    expect(s.target).toBe(build.id);
    h.put(0, 15, 16);
    h.run(1);
    expect(s.attack.windupEndsAt).not.toBeNull();
    expect(s.target).toBe(h.p(0).id);
    h.until(() => h.sim.world.markers.some((m) => m.source === s.id), 60);
    const m = h.sim.world.markers.find((x) => x.source === s.id)!;
    expect(m.x).toBeCloseTo(h.p(0).x, 5);
  });

  it('leaves a knight who goes down and takes the next target', () => {
    const h = arena(['warden']);
    const s = h.sim.spawnEnemy('siege', 18, 16);
    const build = h.sim.addBuild('shield_gen', 18, 18, 0);
    h.put(0, 15, 16);
    h.run(2);
    expect(s.target).toBe(h.p(0).id);
    h.sim.command({ c: 'presence', slot: 0, connected: false });
    h.run(2);
    expect(s.target).toBe(build.id);
  });
});

describe('Hunter (priced stalk, lock-on sprint)', () => {
  /** Walks a Hunter toward a player across a mine; the closest it came to the mine. */
  const closest = (withMine: boolean) => {
    const h = arena(['ranger']);
    h.put(0, 16.5, 14.5);
    const mine = withMine ? h.sim.addBuild('mine', 10.5, 14.5, 0) : null;
    const e = h.sim.spawnEnemy('hunter', 4.5, 14.5);
    let best = Infinity;
    for (let i = 0; i < 60 * 12 && Math.hypot(e.x - 16.5, e.y - 14.5) > 2.2; i++) {
      h.run(1);
      best = Math.min(best, Math.hypot(e.x - 10.5, e.y - 14.5));
    }
    return { best, mine, e };
  };

  it('steers round a hidden build’s trigger radius when one is on its route', () => {
    expect(closest(false).best).toBeLessThan(0.6); // the straight line runs over the spot
    const { best } = closest(true);
    expect(best).toBeGreaterThan(mineDef.triggerRadius + hunterDef.radius);
  });

  it('walks round a real armed mine without setting it off', () => {
    const h = arena(['ranger']);
    const mine = placeMine(h, 10.5, 14.5);
    h.put(0, 16.5, 14.5);
    const e = h.sim.spawnEnemy('hunter', 4.5, 14.5);
    let best = Infinity;
    let triggers = 0;
    for (let i = 0; i < 60 * 12 && Math.hypot(e.x - 16.5, e.y - 14.5) > 2.2; i++) {
      h.run(1);
      triggers += h.events('mineTrigger').length;
      best = Math.min(best, Math.hypot(e.x - 10.5, e.y - 14.5));
    }
    expect(Math.hypot(e.x - 16.5, e.y - 14.5)).toBeLessThanOrEqual(2.2); // it got there
    expect(triggers).toBe(0);
    expect(best).toBeGreaterThan(mineDef.triggerRadius + hunterDef.radius);
    expect(mine.charges).toBe(1);
    expect(h.sim.world.builds).toContain(mine);
  });

  it('re-prices its field when a real mine is used up', () => {
    const h = arena(['ranger']);
    const mine = placeMine(h, 10.5, 14.5);
    h.put(0, 16.5, 14.5);
    h.sim.spawnEnemy('hunter', 4.5, 14.5);
    h.run(2);
    const at = 14 * 36 + 4;
    const priced = h.sim.world.fields.hunted[0]!.dist[at]!;
    mine.triggerAt = h.sim.world.tick;
    h.run(2);
    expect(h.sim.world.builds).not.toContain(mine);
    expect(h.sim.world.fields.hunted[0]!.dist[at]!).toBeLessThan(priced);
  });

  it('prices a build that appears or goes without waiting for the next wave', () => {
    const h = arena(['ranger']);
    h.put(0, 16.5, 14.5);
    const e = h.sim.spawnEnemy('hunter', 4.5, 14.5);
    h.run(2);
    const tile = 14 * 36 + 10;
    const before = h.sim.world.fields.hunted[0]!.dist[14 * 36 + 4]!;
    const mine = h.sim.addBuild('mine', 10.5, 14.5, 0);
    h.run(1);
    expect(h.sim.world.fields.hunted[0]!.dist[14 * 36 + 4]!).toBeGreaterThan(before);
    expect(h.sim.world.fields.hunted[0]!.next[tile]).toBeDefined();
    h.sim.world.builds.splice(h.sim.world.builds.indexOf(mine), 1);
    h.run(1);
    expect(h.sim.world.fields.hunted[0]!.dist[14 * 36 + 4]!).toBeCloseTo(before, 3);
    expect(e.hp).toBe(e.maxHp);
  });

  it('stalks at normal speed, then locks on within 5 tiles and sprints', () => {
    const h = arena(['ranger']);
    h.put(0, 20.5, 20.5);
    const e = h.sim.spawnEnemy('hunter', 6.5, 20.5);
    const speed = hunterDef.speed;
    h.run(10);
    expect(e.locked).toBeUndefined();
    expect(e.huntSince).toBeUndefined(); // no flash while it stalks
    expect(Math.hypot(e.vx, e.vy)).toBeCloseTo(speed, 5);
    h.until(() => e.locked === true, 60 * 15);
    expect(e.huntSince).toBe(h.sim.world.tick - 1); // the flash marks the lock-on
    const d = Math.hypot(e.x - 20.5, e.y - 20.5);
    expect(d).toBeLessThanOrEqual(hunterDef.hunt.lockRange + speed / 60 + 0.01);
    expect(d).toBeGreaterThan(hunterDef.hunt.lockRange - 0.2);
    h.run(1);
    expect(Math.hypot(e.vx, e.vy)).toBeCloseTo(speed * hunterDef.hunt.sprint, 5);
  });

  it('a new quarry ends the lock-on until the new one is close', () => {
    const h = arena(['ranger', 'ranger']);
    h.put(0, 10.5, 20.5);
    h.put(1, 30.5, 8.5);
    const e = h.sim.spawnEnemy('hunter', 8.5, 20.5);
    h.run(2);
    expect(e.locked).toBe(true);
    h.sim.command({ c: 'presence', slot: 0, connected: false });
    h.run(2);
    expect(e.hunting).toBe(1);
    expect(e.locked).toBeUndefined();
    expect(e.huntSince).toBeUndefined();
    expect(Math.hypot(e.vx, e.vy)).toBeCloseTo(hunterDef.speed, 5);
  });
});

describe('Flyer', () => {
  it('has its range up about 1.25× over the tower-defense 3.5', () => {
    expect(flyerDef.attack.range / 3.5).toBeCloseTo(1.25, 1);
  });

  it('never targets a mine under it', () => {
    const h = arena(['ranger']);
    const m = h.sim.addBuild('mine', 18, 14, 0);
    const f = h.sim.spawnEnemy('flyer', 18, 15);
    h.run(30);
    expect(f.target).not.toBe(m.id);
    expect(h.sim.world.builds).toContain(m);
  });

  const flyersFor = (classes: ClassId[]) => {
    const h = harness(classes.length, 5, { classes });
    h.sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: 6 });
    h.run(1);
    h.toCombat();
    return h.sim.world.spawns.filter((g) => g.enemy === 'flyer').length;
  };

  it('spawn only when a connected knight has hitsFlyers', () => {
    expect(flyersFor(['artificer'])).toBeGreaterThan(0);
    expect(flyersFor(['ranger', 'commander'])).toBeGreaterThan(0);
    expect(flyersFor(['warden'])).toBe(0);
    expect(flyersFor(['commander', 'warden'])).toBe(0);
  });
});

describe('per-wave enemy multiplier (§9.3)', () => {
  const withMult = (n: number): Content => ({
    ...baseContent,
    waves: baseContent.waves.map((w) =>
      w.n === n ? { ...w, enemyMult: { hp: 2, damage: 3 } } : w,
    ),
  });

  it('multiplies HP and damage at spawn, after difficulty', () => {
    const h = arena(['ranger'], 1, { content: withMult(1), difficulty: 'hard' });
    const diff = baseContent.difficulties.find((d) => d.id === 'hard')!;
    const g = h.sim.spawnEnemy('grunt', 12, 12);
    expect(g.maxHp).toBeCloseTo(gruntDef.hp * diff.enemyHp * 2, 6);
    expect(g.stats.damage).toBeCloseTo(gruntDef.attack.damage * diff.enemyDamage * 3, 6);
  });

  it('other waves stay at 1', () => {
    const h = arena(['ranger'], 2, { content: withMult(1) });
    const g = h.sim.spawnEnemy('grunt', 12, 12);
    expect(g.maxHp).toBe(gruntDef.hp);
    expect(g.stats.damage).toBe(gruntDef.attack.damage);
  });

  it('scales the boss’s HP, slam, boulder, rings and Charge', () => {
    const h = arena(['ranger', 'ranger'], 15, { content: withMult(15) });
    const b = h.sim.spawnEnemy('colossus', 18, 14);
    expect(b.maxHp).toBeCloseTo(colossusDef.hp * T.hpMk3 * 2, 6);
    expect(b.stats.damage).toBeCloseTo(colossusDef.attack.damage * 3, 6);
    for (const e of h.sim.world.enemies) if (e !== b) e.hp = 0;
    b.boss!.ready = { slam: 1e9, boulder: 0, charge: 1e9, call: 1e9 };
    h.put(0, 18, 19);
    h.put(1, 18.5, 19);
    h.until(() => b.boss!.act?.kind === 'boulder', 10);
    const m = h.sim.world.markers.find((x) => x.id === b.boss!.act!.marker)!;
    expect(m.payload.damage).toBeCloseTo(T.boulderDamage * 3, 6);
  });
});

describe('Colossus moves by Mk (§9.2)', () => {
  /** The attack kinds it starts over 45 s with a knight circling in and out of its reach. */
  const moves = (n: number) => {
    const h = arena(['ranger', 'ranger'], n);
    h.sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
    h.run(1);
    const b = h.sim.spawnEnemy('colossus', 18, 11);
    h.put(1, 35, 1);
    const kinds = new Set<string>();
    for (let i = 0; i < 60 * 45; i++) {
      // Close for the slam a third of the time, else at mid range for the boulder and the Charge.
      h.put(0, b.x, Math.min(23, b.y + (i % 600 < 200 ? 2 : 6)));
      for (const e of h.sim.world.enemies) if (e !== b) e.hp = 0;
      h.run(1);
      if (b.boss!.act) kinds.add(b.boss!.act.kind);
    }
    return [...kinds].sort();
  };

  it('Mk I: slam and boulder', () => {
    expect(moves(5)).toEqual(['boulder', 'slam']);
  });

  it('Mk II adds the Charge', () => {
    expect(moves(10)).toEqual(['boulder', 'charge', 'chargeRun', 'slam']);
  });

  it('Mk III adds Runner calls, before the final phase', () => {
    expect(moves(15)).toEqual(['boulder', 'call', 'charge', 'chargeRun', 'slam']);
  });

  it('only Mk III below half HP gets the final phase’s shockwave', () => {
    const { h, b } = lone(10, 18, 12);
    b.hp = b.maxHp * 0.3;
    h.run(2);
    expect(b.boss!.finalPhase).toBe(false);
  });
});

describe('Colossus Charge', () => {
  /** A Mk II at (18, 8) about to Charge the knight at (18, 16). */
  const setup = () => {
    const { h, b } = lone(10, 18, 8);
    h.put(0, 18, 16);
    b.boss!.ready!.charge = 0;
    h.until(() => b.boss!.act?.kind === 'charge', 5);
    return { h, b };
  };

  it('locks on with a red lane marker through the tell, rooted, then runs the lane', () => {
    const { h, b } = setup();
    const act = b.boss!.act!;
    expect(act.target).toBe(h.p(0).id);
    expect(act.at - act.startedAt).toBe(T.chargeWindupMs * 0.06);
    const m = h.sim.world.markers.find((x) => x.id === act.marker)!;
    expect(m.shape).toBe('lane');
    expect(m.r).toBe(T.chargeHalfWidth);
    expect([m.x, m.y]).toEqual([b.x, b.y]);
    expect(m.x2).toBeCloseTo(18, 2);
    expect(m.y2).toBeCloseTo(16 + T.chargeOvershoot, 1);
    const y = b.y;
    h.run(act.at - h.sim.world.tick);
    expect(b.y).toBeCloseTo(y, 5);
    h.until(() => b.boss!.act?.kind === 'chargeRun', 3);
    h.run(10);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(T.chargeSpeed, 5);
    h.until(() => b.boss!.act === null, 200);
    expect(b.y).toBeCloseTo(m.y2!, 0);
    expect(h.sim.world.markers.some((x) => x.id === m.id)).toBe(false);
  });

  it('destroys an HP build in its lane, leaves the flag, spares one outside', () => {
    const { h, b } = setup();
    const hit = h.sim.addBuild('shield_gen', 18.4, 12, 0);
    const beside = h.sim.addBuild('beacon', 18 + T.chargeHalfWidth + 1.2, 12, 1);
    const flag = h.sim.addBuild('rally_flag', 18, 13, 1);
    h.until(() => b.boss!.act?.kind === 'chargeRun', 120);
    h.until(() => b.boss!.act === null, 200);
    h.run(1);
    const left = h.sim.world.builds;
    expect(left).not.toContain(hit);
    expect(left).toContain(beside);
    expect(beside.hp).toBe(beside.maxHp);
    expect(left).toContain(flag);
  });

  it('sets off a real mine in its lane: the run carries on and the blast hits it', () => {
    const { h, b } = lone(10, 18, 8);
    const mine = placeMine(h, 18, 13);
    b.x = 18;
    b.y = 8;
    h.put(0, 18, 16);
    b.boss!.ready!.charge = 0;
    h.until(() => b.boss!.act?.kind === 'charge', 5);
    const end = h.sim.world.markers.find((m) => m.id === b.boss!.act!.marker)!.y2!;
    h.until(() => b.boss!.act?.kind === 'chargeRun', 120);
    expect(h.sim.world.builds).toContain(mine); // the tell alone doesn't set it off
    const hp = b.hp;
    let triggered = 0;
    let burst = 0;
    for (let i = 0; i < 200 && (b.boss!.act || burst === 0); i++) {
      h.run(1);
      triggered += h.events('mineTrigger').filter((x) => x.build === mine.id).length;
      burst += h.events('mineBurst').filter((x) => x.build === mine.id).length;
    }
    expect([triggered, burst]).toEqual([1, 1]);
    expect(b.hp).toBeLessThan(hp);
    expect(b.boss!.act).toBeNull();
    expect(b.y).toBeCloseTo(end, 0); // too heavy for the mine's knockback: it finished its lane
    h.run(1);
    expect(h.sim.world.builds).not.toContain(mine);
  });

  it('hits a knight in its lane once and knocks him out of it', () => {
    const { h, b } = setup();
    h.sim.command({ c: 'debug', slot: -1, action: 'invincible', on: false });
    h.run(1);
    const p = h.p(0);
    const hits: number[] = [];
    let knocked = false;
    for (let i = 0; i < 400 && (b.boss!.act || i < 5); i++) {
      h.run(1);
      for (const d of h.events('damage')) if (d.target === p.id) hits.push(d.amount);
      if (p.push) knocked = true;
    }
    expect(hits).toEqual([T.chargeDamage]);
    expect(knocked).toBe(true);
    expect(Math.abs(p.x - 18)).toBeGreaterThan(T.chargeHalfWidth);
  });

  it('is dodged: a knight who steps out of the lane during the tell takes nothing', () => {
    const { h, b } = setup();
    h.sim.command({ c: 'debug', slot: -1, action: 'invincible', on: false });
    h.put(0, 18 + T.chargeHalfWidth + 1.5, 16);
    h.until(() => b.boss!.act?.kind === 'chargeRun', 120);
    h.until(() => b.boss!.act === null, 200);
    expect(h.p(0).hp).toBe(h.p(0).maxHp);
  });

  it('a stagger calls it off, lane and all, and it keeps its cooldown', () => {
    const { h, b } = setup();
    const marker = b.boss!.act!.marker!;
    h.until(() => b.boss!.act?.kind === 'chargeRun', 120);
    h.run(4);
    b.boss!.stagger = 0.999;
    h.sim.world.players[1]!.x = b.x + 1;
    h.sim.world.players[1]!.y = b.y;
    h.pads[1]!.tap('mainFires');
    h.until(() => b.boss!.staggeredUntil !== null, 60);
    expect(b.boss!.act).toBeNull();
    expect(Math.hypot(b.vx, b.vy)).toBe(0);
    expect(h.sim.world.markers.some((m) => m.id === marker)).toBe(false);
    expect(b.boss!.ready!.charge!).toBeGreaterThan(h.sim.world.tick);
  });

  it('won’t run into the Citadel: its lane stops short of the walls', () => {
    const { h, b } = lone(10, 18, 12);
    h.put(0, 18, 7);
    b.boss!.ready!.charge = 0;
    h.until(() => b.boss!.act?.kind === 'charge', 5);
    const m = h.sim.world.markers.find((x) => x.id === b.boss!.act!.marker)!;
    expect(m.y2!).toBeGreaterThanOrEqual(2 + b.r - 0.01);
  });
});

describe('answered-by spot checks (§9)', () => {
  it('Ranger outranges the Bombard', () => {
    expect(rangerDef.main.range).toBeGreaterThan(siegeDef.attack.range);
  });

  it('only the Ranger and Artificer can hit Flyers, and so can the sentries', () => {
    const can = baseContent.knights.filter((k) => k.hitsFlyers).map((k) => k.id);
    expect(can.sort()).toEqual(['artificer', 'ranger']);
    expect(baseContent.base!.archers.attack.hitsFlyers).toBe(true);
  });

  it('a Warden stun interrupts the Brute’s wind-up (its tell is the stun window)', () => {
    const h = arena(['warden']);
    const build = h.sim.addBuild('shield_gen', 12, 12, 0);
    const b = h.sim.spawnEnemy('brute', 11, 12);
    h.until(() => b.attack.windupEndsAt !== null, 60);
    h.sim.world.enemies.forEach((e) => {
      if (e === b)
        e.effects.push({ def: 'stun', strength: 1, remaining: 60, stacks: 1, source: null });
    });
    h.run(2);
    expect(b.attack.windupEndsAt).toBeNull();
    expect(build.hp).toBe(build.maxHp);
  });

  it('any targetable build pulls a Brute off the base', () => {
    const h = arena(['artificer']);
    const beacon = h.sim.addBuild('beacon', 30, 20, 0);
    const b = h.sim.spawnEnemy('brute', 18, 8);
    h.run(2);
    expect(b.huntBuild).toBe(beacon.id);
    expect(b.vy).toBeGreaterThan(0); // walking away from the Citadel
  });

  it('Runners ignore builds', () => {
    const h = arena(['warden']);
    const gen = h.sim.addBuild('shield_gen', 18, 14, 0);
    const r = h.sim.spawnEnemy('runner', 18, 16);
    h.run(90);
    expect(gen.hp).toBe(gen.maxHp);
    expect(r.target === null || r.target === BASE_ID).toBe(true);
  });
});

describe('the real rally flag and soldiers (RD9)', () => {
  it('the Charge leaves the flag alone, hits a grounded soldier once, misses one in the air', () => {
    const { h, b } = lone(10, 18, 8, ['commander', 'ranger']);
    const flag = placeFlag(h, 18, 13);
    const at = { ...h.p(0).flag! };
    b.x = 18;
    b.y = 8;
    h.put(0, 18, 16);
    const [ground, air] = h.sim.world.soldiers as [SoldierEnt, SoldierEnt];
    b.boss!.ready!.charge = 0;
    h.until(() => b.boss!.act?.kind === 'chargeRun', 120);
    ground.x = 18;
    ground.y = 13;
    const t = h.sim.world.tick;
    air.x = 18;
    air.y = 13.2;
    air.flight = {
      from: { x: 18, y: 13.2 },
      to: { x: 18, y: 13.4 },
      launchedAt: t,
      landsAt: t + 600,
    };
    const hits = new Map<number, number>();
    let gone = 0;
    for (let i = 0; i < 200 && b.boss!.act; i++) {
      h.run(1);
      for (const d of h.events('damage'))
        if (d.source === b.id) hits.set(d.target, (hits.get(d.target) ?? 0) + 1);
      gone += h.events('buildGone').filter((x) => x.build === flag.id).length;
    }
    expect(gone).toBe(0);
    expect(h.sim.world.builds).toContain(flag);
    expect(flag.hp).toBe(flag.maxHp);
    expect(h.p(0).flag).toEqual(at);
    expect(hits.get(ground.id)).toBe(1);
    expect(hits.get(air.id)).toBeUndefined();
    expect(air.hp).toBe(air.maxHp);
  });

  it('Brutes and Siege never target the flag or stop for it', () => {
    const h = arena(['commander']);
    const flag = placeFlag(h, 18, 16);
    h.put(0, 1, 1);
    const brute = h.sim.spawnEnemy('brute', 15, 16);
    const siege = h.sim.spawnEnemy('siege', 21, 18);
    const y0 = siege.y;
    for (let i = 0; i < 120; i++) {
      h.run(1);
      expect(brute.huntBuild).toBeUndefined();
      expect(brute.target).not.toBe(flag.id);
      expect(siege.target).not.toBe(flag.id);
      expect(siege.ai).toBe('path');
    }
    expect(siege.y).toBeLessThan(y0);
    expect(h.sim.world.builds).toContain(flag);
  });

  it('Siege shells knights, never picks a soldier, and its blast still hits one beside him', () => {
    const h = arena(['commander']);
    const s = h.sim.spawnEnemy('siege', 18, 16);
    h.put(0, 14, 16);
    const u = h.sim.world.soldiers[0]!;
    h.until(() => h.sim.world.markers.some((m) => m.source === s.id), 180);
    expect(s.target).toBe(h.p(0).id);
    const m = h.sim.world.markers.find((x) => x.source === s.id)!;
    let hits = 0;
    while (h.sim.world.tick <= m.landsAt) {
      u.x = m.x;
      u.y = m.y;
      h.run(1);
      hits += h.events('damage').filter((d) => d.source === s.id && d.target === u.id).length;
      expect(s.target).not.toBe(u.id);
    }
    expect(hits).toBe(1);
  });

  it('a Hunter keeps its knight as quarry while soldiers at the flag fight it', () => {
    const h = arena(['commander']);
    placeFlag(h, 14, 20);
    h.run(60);
    h.put(0, 30, 20);
    const ids = new Set(h.sim.world.soldiers.map((u) => u.id));
    const e = h.sim.spawnEnemy('hunter', 11, 20);
    for (let i = 0; i < 240; i++) {
      h.run(1);
      expect(e.hunting).toBe(0);
      expect(e.target === null || !ids.has(e.target)).toBe(true);
    }
    expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('the Colossus slams a grounded soldier in reach, not one in the air', () => {
    const { h, b } = lone(10, 18, 12, ['commander', 'ranger']);
    const [u, other] = h.sim.world.soldiers as [SoldierEnt, SoldierEnt];
    other.hp = 0;
    h.run(1);
    const t = h.sim.world.tick;
    u.x = b.x;
    u.y = b.y + 2;
    u.flight = {
      from: { x: b.x, y: b.y + 2 },
      to: { x: b.x, y: b.y + 2 },
      launchedAt: t,
      landsAt: t + 30,
    };
    b.boss!.ready!.slam = 0;
    h.run(5);
    expect(b.boss!.act).toBeNull();
    h.until(() => u.flight === null, 40);
    h.until(() => b.boss!.act?.kind === 'slam', 5);
    expect(b.boss!.act!.target).toBe(u.id);
  });
});
