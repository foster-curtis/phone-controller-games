// Run phases (SPEC §4, §9.3, §9.4, §10.2, §15.3 step 10): countdown, build (ready + 45 s cap), combat
// (spawner, warnings, scaling), wave clear, victory, defeat, summary.
import { describe, expect, it } from 'vitest';
import { rules, waves } from '../../../content/balance';
import { createSim } from '../index';
import { harness, startOf } from './harness';

const steps = (ms: number) => Math.round((ms / 1000) * 60);

describe('countdown and build', () => {
  it('the run opens with a 3 s countdown, then the build phase of wave 1', () => {
    const h = harness(1);
    expect(h.sim.world.phase).toBe('countdown');
    expect(h.sim.world.wave).toBe(1);
    const phases = h.collect('phase', steps(rules.countdownMs) + 1);
    expect(phases).toEqual([{ e: 'phase', phase: 'build', wave: 1 }]);
    expect(h.sim.world.phaseEndsAt).toBe(h.sim.world.tick - 1 + steps(rules.buildCapMs));
  });

  it('ready-up from every connected player starts the wave', () => {
    const h = harness(3);
    h.toBuild();
    h.sim.command({ c: 'presence', slot: 2, connected: false });
    h.sim.command({ c: 'ready', slot: 0, ready: true, ref: 9 });
    h.run(2);
    expect(h.sim.world.phase).toBe('build');
    expect(h.p(0).ready).toBe(true);
    h.sim.command({ c: 'ready', slot: 1, ready: true });
    h.run(1);
    expect(h.sim.world.phase).toBe('combat');
    expect(h.events('phase')).toEqual([{ e: 'phase', phase: 'combat', wave: 1 }]);
    expect(h.sim.world.players.every((p) => !p.ready)).toBe(true);
  });

  it('un-readying holds the wave; ready outside the build phase is refused', () => {
    const h = harness(2);
    h.toBuild();
    h.sim.command({ c: 'ready', slot: 0, ready: true });
    h.sim.command({ c: 'ready', slot: 0, ready: false });
    h.sim.command({ c: 'ready', slot: 1, ready: true });
    h.run(2);
    expect(h.sim.world.phase).toBe('build');
    h.toCombat();
    h.sim.command({ c: 'ready', slot: 0, ready: true, ref: 3 });
    h.run(1);
    expect(h.events('command')[0]).toMatchObject({ ok: false, reason: 'phase' });
  });

  it('the 45 s cap starts the wave without everyone ready', () => {
    const h = harness(2);
    h.toBuild();
    const start = h.sim.world.tick;
    h.sim.command({ c: 'ready', slot: 0, ready: true });
    h.until(() => h.sim.world.phase === 'combat', steps(rules.buildCapMs) + 5);
    expect(h.sim.world.tick - 1 - start).toBe(steps(rules.buildCapMs) - 1);
  });
});

describe('combat: spawner, warnings, scaling', () => {
  it('each group is announced on its lane 3 s before it spawns', () => {
    const h = harness(2);
    h.toCombat();
    const warnings: { lane: string; spawnsAtTick: number; at: number }[] = [];
    const spawns: { lane: string | null; at: number }[] = [];
    h.sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
    for (let i = 0; i < 60 * 40 && h.sim.world.phase === 'combat'; i++) {
      h.sim.step();
      const t = h.sim.world.tick - 1;
      for (const e of h.events('laneWarning')) warnings.push({ ...e, at: t });
      for (const e of h.events('spawn')) spawns.push({ lane: e.lane, at: t });
    }
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) {
      expect(w.lane).toBe('bottom');
      expect(w.spawnsAtTick - w.at).toBe(steps(rules.spawnWarningMs));
      expect(spawns.some((s) => s.at === w.spawnsAtTick)).toBe(true);
    }
    expect(spawns.every((s) => s.lane === 'bottom')).toBe(true);
  });

  it('scales the wave from the players connected at its start', () => {
    const count = (players: number, connected: number) => {
      const start = startOf(players, 5);
      start.slots.forEach((s, i) => (s.connected = i < connected));
      const sim = createSim(start);
      const phase = () => sim.world.phase;
      while (phase() !== 'build') sim.step();
      for (const p of sim.world.players) sim.command({ c: 'ready', slot: p.slot, ready: true });
      while (phase() !== 'combat') sim.step();
      const n = sim.world.spawns.reduce((a, s) => a + s.count, 0) + sim.world.enemies.length;
      return { n, scaling: sim.world.team.scaling };
    };
    const two = count(4, 2);
    expect(two.scaling).toEqual({ players: 2, mult: 1, flyers: true });
    expect(Math.abs(two.n - waves[0]!.budget)).toBeLessThanOrEqual(1);
    const four = count(4, 4);
    expect(four.scaling.mult).toBe(1.5);
    expect(Math.abs(four.n - waves[0]!.budget * 1.5)).toBeLessThanOrEqual(1);
  });
});

describe('wave end, victory, defeat', () => {
  it('the wave ends only when every enemy is dead and none are left to spawn', () => {
    const h = harness(1);
    h.toCombat();
    h.sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
    h.until(() => h.sim.world.enemies.length > 0, 60 * 10);
    for (const e of h.sim.world.enemies) e.hp = 0;
    h.run(1);
    expect(h.sim.world.phase).toBe('combat'); // more groups still to come
    h.until(() => h.sim.world.spawns.length === 0, 60 * 40);
    h.run(1);
    expect(h.sim.world.enemies.length).toBeGreaterThan(0);
    for (const e of h.sim.world.enemies) e.hp = 0;
    const p = h.p(0);
    p.hp = 0; // dead at the end of combat: back at once in the build phase
    h.run(1);
    expect(h.events('waveCleared')).toEqual([{ e: 'waveCleared', wave: 1 }]);
    expect(h.sim.world.phase).toBe('build');
    expect(h.sim.world.wave).toBe(2);
    h.run(1);
    expect(p.respawnAt).toBeNull();
    expect(p.hp).toBe(p.maxHp);
  });

  it('kills pay their budget cost into the team pool', () => {
    const h = harness(1);
    h.toCombat();
    h.holdSpawns();
    const coins = h.sim.world.team.coins;
    const g = h.sim.spawnEnemy('grunt', 10, 15);
    g.hp = 1;
    h.put(0, 10, 18);
    h.pads[0]!.tap('mainFires');
    h.run(30);
    expect(h.sim.world.team.coins).toBe(coins + 1);
    expect(h.p(0).run.kills).toBe(1);
  });

  it('clearing the last wave is a victory, then the summary', () => {
    const h = harness(1);
    h.sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: waves.length });
    h.run(1);
    expect(h.sim.world.phase).toBe('build');
    expect(h.sim.world.wave).toBe(waves.length);
    h.toCombat();
    h.sim.world.spawns.length = 0;
    for (const e of h.sim.world.enemies) e.hp = 0;
    h.run(1);
    expect(h.sim.world.phase).toBe('victory');
    expect(h.events('runEnd')).toEqual([{ e: 'runEnd', result: 'victory', wave: waves.length }]);
    h.run(steps(rules.victoryMs));
    expect(h.sim.world.phase).toBe('summary');
  });

  it('the base at 0 HP is a defeat, then the summary', () => {
    const h = harness(1);
    h.toCombat();
    h.holdSpawns();
    h.put(0, 30, 10);
    const b = h.sim.world.base;
    b.hp = 5;
    const g = h.sim.spawnEnemy('grunt', 18, 3.5);
    g.hp = g.maxHp = 1e6;
    h.until(() => h.sim.world.phase === 'defeat', 600);
    expect(b.hp).toBe(0);
    expect(h.events('runEnd')).toEqual([{ e: 'runEnd', result: 'defeat', wave: 1 }]);
    h.run(steps(rules.defeatMs));
    expect(h.sim.world.phase).toBe('summary');
  });
});
