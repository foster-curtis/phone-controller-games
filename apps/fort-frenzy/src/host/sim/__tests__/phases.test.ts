// Run phases (SPEC §4, §9.3, §9.4, §10.2, §15.3 step 10): countdown, build (ready + 20 s cap, the
// random card pick at its end), combat
// (spawner, warnings, scaling), wave clear, victory, defeat, summary.
import { rngStream } from '@pcg/game-kit';
import { describe, expect, it } from 'vitest';
import { rules, waves } from '../../../content/balance';
import { PORTAL_IDS } from '../../../shared/ids';
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

  it('the 20 s cap starts the wave without everyone ready', () => {
    expect(rules.buildCapMs).toBe(20_000);
    const h = harness(2);
    h.toBuild();
    const start = h.sim.world.tick;
    h.sim.command({ c: 'ready', slot: 0, ready: true });
    h.until(() => h.sim.world.phase === 'combat', steps(rules.buildCapMs) + 5);
    expect(h.sim.world.tick - 1 - start).toBe(steps(rules.buildCapMs) - 1);
  });

  it('at the deadline a card not confirmed is picked from cardPick:<wave>:<slot> (§10.2)', () => {
    const run = (seed: number) => {
      const h = harness(3, seed);
      h.toBuild();
      const offers = h.sim.world.players.map((p) => [...p.offer!]);
      // Slot 0 confirms; slot 1 is Ready without a card; slot 2 does nothing.
      h.sim.command({ c: 'card', slot: 0, card: offers[0]![2]! });
      h.sim.command({ c: 'ready', slot: 1, ready: true });
      const autos: { slot: number; card: string }[] = [];
      for (let i = 0; i < steps(rules.buildCapMs) + 5 && h.sim.world.phase === 'build'; i++) {
        h.sim.step();
        for (const e of h.events('cardAuto')) autos.push({ slot: e.slot, card: e.card });
      }
      expect(h.sim.world.phase).toBe('combat');
      return { h, offers, autos, cards: h.sim.world.players.map((p) => ({ ...p.cards })) };
    };
    const a = run(4);
    expect(a.autos.map((x) => x.slot)).toEqual([1, 2]);
    for (const x of a.autos) {
      const want = rngStream(4, `cardPick:1:${x.slot}`).pick(a.offers[x.slot]!);
      expect(x.card).toBe(want);
      expect(a.cards[x.slot]).toEqual({ [want]: 1 });
    }
    expect(a.cards[0]).toEqual({ [a.offers[0]![2]!]: 1 });
    // The same seed picks the same cards.
    const b = run(4);
    expect(b.autos).toEqual(a.autos);
    expect(b.cards).toEqual(a.cards);
  });

  it('everyone Ready ends the phase early; unconfirmed cards are still picked', () => {
    const h = harness(2, 6);
    h.toBuild();
    const start = h.sim.world.tick;
    for (const p of h.sim.world.players) h.sim.command({ c: 'ready', slot: p.slot, ready: true });
    const autos = h.collect('cardAuto', 2);
    expect(h.sim.world.phase).toBe('combat');
    expect(h.sim.world.tick - start).toBeLessThan(5);
    expect(autos.map((e) => e.slot)).toEqual([0, 1]);
    for (const p of h.sim.world.players) expect(Object.keys(p.cards)).toHaveLength(1);
  });
});

describe('combat: spawner, warnings, scaling', () => {
  it('a group’s portal flares flareMs before it spawns; groups use all six portals', () => {
    const h = harness(2);
    h.toCombat();
    const flares: { portal: string; at: number }[] = [];
    const spawns: { portal: string | null; at: number }[] = [];
    h.sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
    for (let i = 0; i < 60 * 40 && h.sim.world.phase === 'combat'; i++) {
      h.sim.step();
      const t = h.sim.world.tick - 1;
      for (const e of h.events('portalFlare')) flares.push({ portal: e.portal, at: t });
      for (const e of h.events('spawn')) spawns.push({ portal: e.portal, at: t });
    }
    expect(flares.length).toBeGreaterThan(0);
    const lead = steps(rules.flareMs);
    for (const fl of flares) {
      expect(PORTAL_IDS).toContain(fl.portal);
      expect(spawns.some((x) => x.portal === fl.portal && x.at === fl.at + lead)).toBe(true);
    }
    for (const x of spawns) expect(PORTAL_IDS).toContain(x.portal);
    // Spawn pulses spread over every portal (each pulse up to players + 1 of them, §9.3).
    expect(new Set(spawns.map((x) => x.portal)).size).toBe(PORTAL_IDS.length);
  });

  it('debug spawn: a group at the chosen portal; an unknown portal is refused', () => {
    const h = harness(1);
    h.toCombat();
    h.holdSpawns();
    h.sim.command({ c: 'debug', slot: -1, action: 'spawn', enemy: 'grunt', portal: 'right-s' });
    h.sim.step();
    const e = h.sim.world.enemies.find((x) => x.portal === 'right-s')!;
    const at = h.sim.content.map!.portals['right-s'].spawn;
    expect(Math.abs(e.x - at.x)).toBeLessThan(1);
    expect(Math.abs(e.y - at.y)).toBeLessThan(1);
    h.sim.command({
      c: 'debug',
      slot: -1,
      action: 'spawn',
      enemy: 'grunt',
      portal: 'top' as never,
      ref: 9,
    });
    h.sim.step();
    expect(h.events('command').find((x) => x.ref === 9)).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
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
    expect(two.scaling).toEqual({
      players: 2,
      budget: 1,
      bossHp: 1,
      respawnMs: 10_000,
      activeCap: 3,
      flyers: true,
    });
    expect(Math.abs(two.n - waves[0]!.budget)).toBeLessThanOrEqual(1);
    const four = count(4, 4);
    expect(four.scaling.budget).toBe(1.5);
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
