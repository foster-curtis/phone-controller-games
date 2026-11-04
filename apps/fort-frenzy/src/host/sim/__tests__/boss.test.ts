// FF11 Colossus scenarios (SPEC §9.2, §9.4, §15.3): the slam's 1.5 s marker, the forms per boss wave
// (Mk I slam + wall breaker; Mk II boulders and escorts; Mk III's final phase below half HP with
// shockwave rings and Runner calls), the stagger meter against a Warden-only stun loop, HP scaling,
// and the boss's death ending the wave.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { colossus as colossusDef } from '../../../content/enemies';
import type { ClassId } from '../../../shared/ids';
import { COLOSSUS_TUNING_KEYS, tuning } from '../boss/colossus';
import type { EnemyEnt } from '../types';
import { harness, type Harness } from './harness';

const T = tuning(colossusDef);
const SLAM_STEPS = 90;

interface Opts {
  players?: number;
  classes?: ClassId[];
  invincible?: boolean;
}

/** Combat of wave `n` (debug jump), everyone ready. */
function waveCombat(n: number, o: Opts = {}): Harness {
  const players = o.classes?.length ?? o.players ?? 2;
  const h = harness(players, 5, { classes: o.classes });
  if (o.invincible) h.sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
  h.sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: n });
  h.run(1);
  h.toCombat();
  return h;
}

/** Waits for the wave's own Colossus to walk in. */
function bossOf(h: Harness): EnemyEnt {
  h.until(() => h.sim.world.enemies.some((e) => e.kind === 'colossus'), 60 * 10);
  return h.sim.world.enemies.find((e) => e.kind === 'colossus')!;
}

/** Combat of wave `n` with nothing spawning but one Colossus placed at (x, y), escorts removed. */
function lone(n: number, x: number, y: number, o: Opts = {}): { h: Harness; b: EnemyEnt } {
  const h = waveCombat(n, o);
  h.sim.world.spawns.length = 0;
  const b = h.sim.spawnEnemy('colossus', x, y);
  for (const e of h.sim.world.enemies) if (e !== b) e.hp = 0;
  h.run(1);
  return { h, b };
}

/** Parks every player far from (x, y) in the top corners (out of slam and boulder reach). */
function park(h: Harness) {
  h.sim.world.players.forEach((p, i) => h.put(p.slot, i % 2 === 0 ? 1 : 35, 3 + i * 0.5));
}

describe('Colossus content', () => {
  it('has every tuning param and is the boss of waves 5, 10 and 15', () => {
    for (const k of COLOSSUS_TUNING_KEYS) expect(typeof T[k], k).toBe('number');
    expect(colossusDef.vsStructure.wall).toBe(3);
    expect(content.waves.filter((w) => w.boss).map((w) => [w.n, w.boss!.mk])).toEqual([
      [5, 1],
      [10, 2],
      [15, 3],
    ]);
  });
});

describe('Colossus slam', () => {
  it('lands exactly 90 steps after its marker appears, on the players inside it', () => {
    const { h, b } = lone(5, 18, 12);
    h.put(0, 18, 14);
    h.put(1, 30, 20);
    h.until(() => h.events('marker').some((m) => m.source === b.id), 60);
    const at = h.sim.world.tick - 1;
    const m = h.sim.world.markers.find((x) => x.source === b.id)!;
    expect(m.createdAt).toBe(at);
    expect(m.landsAt - m.createdAt).toBe(SLAM_STEPS);
    expect(b.boss!.act?.kind).toBe('slam');
    const p0 = h.p(0).id;
    let hitAt = -1;
    for (let i = 0; i < SLAM_STEPS + 5 && hitAt < 0; i++) {
      h.run(1);
      // Rooted through the wind-up.
      if (i < SLAM_STEPS - 1) expect(Math.hypot(b.vx, b.vy)).toBe(0);
      if (h.events('damage').some((d) => d.source === b.id && d.target === p0))
        hitAt = h.sim.world.tick - 1;
    }
    expect(hitAt - at).toBe(SLAM_STEPS);
    expect(h.p(0).hp).toBe(h.p(0).maxHp - colossusDef.attack.damage);
  });

  it('can be dodged: stepping out of the circle during the wind-up takes nothing', () => {
    const { h, b } = lone(5, 18, 12);
    h.put(0, 18, 14);
    h.put(1, 30, 20);
    h.until(() => h.events('marker').some((m) => m.source === b.id), 60);
    h.put(0, 18, 19);
    h.run(SLAM_STEPS + 2);
    expect(h.p(0).hp).toBe(h.p(0).maxHp);
  });

  it('at the Citadel it slams the base with heavy hits (1.5×), not at once', () => {
    const { h, b } = lone(5, 18, 3.4);
    park(h);
    const hp0 = h.sim.world.base.hp;
    const hits = h.collect('baseHit', 60 * 10);
    expect(b.boss!.act === null || b.boss!.act?.target === 0).toBe(true);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0]!.amount).toBe(colossusDef.attack.damage * 1.5);
    expect(h.sim.world.base.hp).toBeGreaterThan(0);
    expect(hp0 - h.sim.world.base.hp).toBe(hits.length * colossusDef.attack.damage * 1.5);
  });

  it("can't be knocked back", () => {
    const { h, b } = lone(5, 18, 12);
    park(h);
    const x0 = b.x;
    b.push = { x: 12, y: 0 };
    h.run(1);
    expect(Math.abs(b.x - x0)).toBeLessThan(0.05);
  });
});

describe('boss waves', () => {
  it('wave 5: Mk I, only the slam and the wall breaker (walls take 3×)', () => {
    const h = waveCombat(5, { invincible: true });
    for (let c = 0; c < 36; c++) h.sim.place('wall', c, 15, 0);
    h.put(0, 18.5, 9);
    h.put(1, 17.5, 9.5);
    const b = bossOf(h);
    expect(b.boss!.mk).toBe(1);
    expect(b.maxHp).toBe(colossusDef.hp);
    const kinds = new Set<string>();
    let wallHit = 0;
    let lastStart = -1;
    for (let i = 0; i < 60 * 60 && b.hp > 0; i++) {
      h.run(1);
      const act = b.boss!.act;
      if (act && act.startedAt !== lastStart) {
        lastStart = act.startedAt;
        kinds.add(act.kind);
      }
      for (const d of h.events('damage'))
        if (d.source === b.id && h.sim.world.structures.some((s) => s.id === d.target))
          wallHit = Math.max(wallHit, d.amount);
      expect(h.sim.world.projectiles.some((p) => p.from === 'colossus')).toBe(false);
      expect(h.sim.world.markers.some((m) => m.shape === 'ring')).toBe(false);
    }
    expect([...kinds].sort()).toEqual(['breaker', 'slam']);
    expect(wallHit).toBe(colossusDef.attack.damage * 3);
    // No final phase below half HP before Mk III.
    b.hp = b.maxHp * 0.3;
    h.run(5);
    expect(b.boss!.finalPhase).toBe(false);
  });

  it('wave 10: Mk II walks in with Grunt and Swarm escorts in its lane', () => {
    const h = waveCombat(10, { invincible: true });
    h.until(() => h.events('spawn').some((e) => e.enemy === 'colossus'), 60 * 10);
    const spawns = h.events('spawn');
    const boss = spawns.find((e) => e.enemy === 'colossus')!;
    const b = h.sim.world.enemies.find((e) => e.id === boss.id)!;
    expect(b.boss!.mk).toBe(2);
    expect(b.maxHp).toBe(colossusDef.hp * T.hpMk2);
    const escorts = spawns.filter((e) => e.enemy !== 'colossus');
    expect(escorts.filter((e) => e.enemy === 'grunt')).toHaveLength(T.escortGrunts);
    expect(escorts.filter((e) => e.enemy === 'swarm')).toHaveLength(8 * T.escortSwarms);
    for (const e of escorts) expect(e.lane).toBe(boss.lane);
  });

  it('wave 10: throws a boulder at the largest group of players, landing with its marker', () => {
    const { h, b } = lone(10, 18, 16);
    h.put(0, 18, 9);
    h.put(1, 18.6, 9.2);
    h.until(() => b.boss!.act?.kind === 'boulder', 60 * 8);
    const act = b.boss!.act!;
    expect(act.x).toBeCloseTo(18.3, 5);
    expect(act.y).toBeCloseTo(9.1, 5);
    const m = h.sim.world.markers.find((x) => x.id === act.marker)!;
    expect(m.r).toBe(T.boulderRadius);
    // The wind-up, then the boulder leaves the fist and arcs onto the marker.
    h.until(() => h.sim.world.projectiles.some((p) => p.from === 'colossus'), 61);
    expect(h.sim.world.tick - 1 - act.startedAt).toBe(T.boulderWindupMs * 0.06);
    const shot = h.sim.world.projectiles.find((p) => p.from === 'colossus')!;
    expect(shot.arc!.landsAt).toBe(m.landsAt);
    const ids = new Set([h.p(0).id, h.p(1).id]);
    let hits = 0;
    for (let i = 0; i < 200 && hits === 0; i++) {
      h.run(1);
      hits = h.events('damage').filter((d) => d.source === b.id && ids.has(d.target)).length;
      if (hits > 0) expect(h.sim.world.tick - 1).toBe(m.landsAt);
    }
    expect(hits).toBe(2);
  });

  it('wave 10: with no group, a tower is the boulder target', () => {
    const { h, b } = lone(10, 18, 18);
    h.put(0, 12, 14);
    h.put(1, 26, 14);
    const tower = h.sim.place('arrow_tower', 18, 12, 0);
    h.until(() => b.boss!.act?.kind === 'boulder', 60 * 8);
    expect(b.boss!.act!.target).toBe(tower.id);
    expect(b.boss!.act!.x).toBe(tower.x);
  });

  it('wave 15: Mk III goes into its final phase below 50% HP, moving and attacking faster', () => {
    const { h, b } = lone(15, 18, 20);
    park(h);
    expect(b.boss!.mk).toBe(3);
    expect(b.maxHp).toBe(colossusDef.hp * T.hpMk3);
    h.run(30);
    const v0 = Math.hypot(b.vx, b.vy);
    expect(v0).toBeGreaterThan(0);
    b.hp = b.maxHp * 0.51;
    h.run(2);
    expect(b.boss!.finalPhase).toBe(false);
    b.hp = b.maxHp * 0.49;
    h.run(1);
    expect(b.boss!.finalPhase).toBe(true);
    // Runner calls from the spires: the first right away, then on the shortened cooldown.
    const runners: number[] = [];
    for (let i = 0; i < 60 * 9; i++) {
      h.run(1);
      const n = h.events('spawn').filter((e) => e.enemy === 'runner').length;
      if (n > 0) {
        expect(n).toBe(T.runners);
        runners.push(h.sim.world.tick);
      }
    }
    expect(runners.length).toBe(2);
    expect(runners[1]! - runners[0]!).toBe(
      Math.round(((T.callCooldownMs * T.finalCooldown) / 1000) * 60) + T.callWindupMs * 0.06,
    );
    // Faster on the move.
    for (const e of h.sim.world.enemies) if (e !== b) e.hp = 0;
    h.until(() => b.boss!.act === null && Math.hypot(b.vx, b.vy) > 0, 120);
    expect(Math.hypot(b.vx, b.vy) / v0).toBeCloseTo(T.finalSpeed, 2);
  });

  it('wave 15: each final-phase slam sends out shockwave rings', () => {
    const { h, b } = lone(15, 18, 12);
    park(h);
    b.hp = b.maxHp * 0.4;
    h.run(1);
    expect(b.boss!.finalPhase).toBe(true);
    // Past the first Runner call, then a player in reach.
    h.until(() => b.boss!.act === null && (b.boss!.ready?.call ?? 0) > h.sim.world.tick, 300);
    for (const e of h.sim.world.enemies) if (e !== b) e.hp = 0;
    h.put(0, b.x, b.y + 2);
    h.until(() => b.boss!.act?.kind === 'slam', 60);
    const landsAt = b.boss!.act!.at;
    h.until(() => h.sim.world.markers.some((m) => m.shape === 'ring'), SLAM_STEPS + 2);
    expect(h.sim.world.tick - 1).toBe(landsAt);
    const ringsOut = h.sim.world.markers.filter((m) => m.shape === 'ring');
    expect(ringsOut).toHaveLength(T.ringCount);
    const step = Math.round((T.ringStepMs * 60) / 1000);
    ringsOut.forEach((m, k) => {
      expect(m.landsAt - landsAt).toBe((k + 1) * step);
      expect(m.r - m.inner!).toBeCloseTo(T.ringBand, 6);
      expect(m.payload.hitsStructures).toBe(false);
    });
  });
});

describe('Colossus stagger', () => {
  it('a Warden-only stun loop staggers it now and then, never continuously', () => {
    const h = waveCombat(5, { classes: ['warden'], invincible: true });
    h.sim.world.spawns.length = 0;
    const b = h.sim.spawnEnemy('colossus', 18, 12);
    const stomp = content.characters.find((c) => c.id === 'warden')!.super.damage;
    const on: boolean[] = [];
    const hits = { staggered: new Set<number>(), standing: new Set<number>() };
    for (let i = 0; i < 60 * 60; i++) {
      // The Warden stays at its side with a full super, stomping as often as the cooldown lets him.
      h.put(0, b.x, b.y + 1.5);
      h.p(0).superCharge = 1;
      if (i % 10 === 0) h.pads[0]!.tap('superFires');
      h.run(1);
      const st = b.boss!.staggeredUntil !== null;
      on.push(st);
      for (const d of h.events('damage'))
        if (d.target === b.id) (st ? hits.staggered : hits.standing).add(d.amount);
    }
    // Stagger runs: each ≤ 3 s, with at least 2 s on its feet between them, under half the time.
    const runs: { from: number; to: number }[] = [];
    on.forEach((v, i) => {
      if (v && (i === 0 || !on[i - 1])) runs.push({ from: i, to: i });
      if (v) runs[runs.length - 1]!.to = i;
    });
    expect(runs.length).toBeGreaterThanOrEqual(2);
    for (const r of runs) expect(r.to - r.from + 1).toBeLessThanOrEqual(T.staggerMs * 0.06 + 1);
    for (let i = 1; i < runs.length; i++)
      expect(runs[i]!.from - runs[i - 1]!.to).toBeGreaterThanOrEqual(120);
    expect(on.filter(Boolean).length / on.length).toBeLessThan(0.5);
    // Never stunned itself; bonus damage only while staggered.
    expect(b.effects.some((e) => e.def === 'stun')).toBe(false);
    expect([...hits.standing]).toContain(stomp);
    expect([...hits.staggered]).toContain(stomp * (1 + T.staggerBonus));
  });

  it('damage alone fills the meter and staggers it, calling off its wind-up', () => {
    const { h, b } = lone(5, 18, 12);
    h.put(0, 18, 14);
    h.until(() => b.boss!.act?.kind === 'slam', 60);
    const marker = b.boss!.act!.marker;
    // Just under a full meter, then one more hit.
    b.boss!.stagger = 0.99;
    h.sim.world.players[1]!.x = 18;
    h.sim.world.players[1]!.y = 14.5;
    h.p(1).main.readyAt = 0;
    h.pads[1]!.tap('mainFires');
    h.until(() => b.boss!.staggeredUntil !== null, 60);
    expect(h.events('stagger')).toEqual([{ e: 'stagger', id: b.id, on: true }]);
    expect(b.boss!.act).toBeNull();
    expect(h.sim.world.markers.some((m) => m.id === marker)).toBe(false);
    expect(b.boss!.stagger).toBe(0);
    const off = h.collect('stagger', T.staggerMs * 0.06 + 1);
    expect(off).toEqual([{ e: 'stagger', id: b.id, on: false }]);
  });
});

describe('boss HP and the wave end', () => {
  it('scales HP with the players connected at wave start', () => {
    expect(bossOf(waveCombat(5, { players: 4 })).maxHp).toBe(colossusDef.hp * 1.5);
    expect(bossOf(waveCombat(5, { players: 1 })).maxHp).toBe(colossusDef.hp * 0.75);
  });

  it('its death ends the wave: the rest collapse with no coins and the build phase follows', () => {
    const h = waveCombat(5, { invincible: true });
    park(h);
    const b = bossOf(h);
    h.until(() => h.sim.world.enemies.some((e) => e.kind === 'grunt'), 60 * 40);
    // Escorts dying alone don't end a boss wave.
    expect(h.sim.world.phase).toBe('combat');
    const coins = h.sim.world.team.coins;
    b.hp = 0;
    h.run(1);
    const deaths = h.events('death').filter((d) => d.what === 'enemy');
    expect(deaths.length).toBeGreaterThanOrEqual(2);
    expect(deaths.filter((d) => d.id !== b.id).every((d) => d.killer === null)).toBe(true);
    expect(h.events('waveCleared')).toEqual([{ e: 'waveCleared', wave: 5 }]);
    expect(h.sim.world.phase).toBe('build');
    expect(h.sim.world.wave).toBe(6);
    expect(h.sim.world.enemies).toHaveLength(0);
    expect(h.sim.world.team.coins - coins).toBe(colossusDef.budget);
  });

  it('the boss wave lasts while it lives, even with every escort dead', () => {
    const h = waveCombat(5, { invincible: true });
    park(h);
    bossOf(h);
    h.sim.world.spawns.length = 0;
    for (const e of h.sim.world.enemies) if (e.kind !== 'colossus') e.hp = 0;
    h.run(3);
    expect(h.sim.world.phase).toBe('combat');
    expect(h.sim.world.enemies.map((e) => e.kind)).toEqual(['colossus']);
  });

  it('the wave 15 boss dying wins the run', () => {
    const h = waveCombat(15, { invincible: true });
    park(h);
    const b = bossOf(h);
    b.hp = 0;
    h.run(1);
    expect(h.events('runEnd')).toEqual([{ e: 'runEnd', result: 'victory', wave: 15 }]);
  });
});
