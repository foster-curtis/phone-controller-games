// The player-count table (SPEC §9.4; RD3): budget, boss HP and respawn per player count 1–6, the
// difficulty's respawn multiplier (§2.2), Quick Recovery's floors (§5), and solo runs (§11.1).
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { colossus, difficulties, enemies, rules, scaling, waves } from '../../../content/balance';
import type { DifficultyId } from '../../../shared/ids';
import { harness } from './harness';

const steps = (ms: number) => Math.max(1, Math.round((ms * 60) / 1000));
const cost = (id: string) => enemies.find((e) => e.id === id)!.budget;

/** Kills slot 0 in combat; returns the respawn delay in ms. */
function respawnAfterDeath(h: ReturnType<typeof harness>): number {
  const p = h.p(0);
  p.hp = 0;
  h.run(1);
  const t = h.sim.world.tick - 1;
  return ((p.respawnAt! - t) * 1000) / 60;
}

describe('player-count table (§9.4)', () => {
  it('has the rows 1–6 (budget, boss HP; respawn 6 s solo, 10 s for 2–4, 15 s for 5–6)', () => {
    expect(scaling.map((r) => [r.players, r.budget, r.bossHp, r.respawnMs])).toEqual([
      [1, 0.6, 0.6, 6000],
      [2, 1, 1, 10_000],
      [3, 1.25, 1.25, 10_000],
      [4, 1.5, 1.5, 10_000],
      [5, 1.75, 1.75, 15_000],
      [6, 2, 2, 15_000],
    ]);
  });

  for (const row of scaling) {
    it(`${row.players} player(s): the wave start fixes its row; budget and respawn follow it`, () => {
      const h = harness(row.players, 3);
      h.toCombat();
      const w = h.sim.world;
      expect(w.team.scaling).toMatchObject({
        players: row.players,
        budget: row.budget,
        bossHp: row.bossHp,
        respawnMs: row.respawnMs,
        activeCap: Math.min(row.players + 1, 6),
      });
      // What the generator spent (wave 1: Grunts at cost 1) is the wave budget × the row.
      const spent = w.spawns.reduce((a, s) => a + cost(s.enemy), 0);
      expect(Math.abs(spent - waves[0]!.budget * row.budget)).toBeLessThanOrEqual(1);
      h.holdSpawns();
      expect(respawnAfterDeath(h)).toBeCloseTo(row.respawnMs, -2);
    });
  }

  it('boss HP scales with the row', () => {
    const bossHp = (players: number) => {
      const h = harness(players, 2);
      h.toBuild();
      h.sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: 5 });
      h.run(1);
      h.sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
      h.toCombat();
      h.until(() => h.sim.world.enemies.some((e) => e.kind === 'colossus'), 60 * 5);
      return h.sim.world.enemies.find((e) => e.kind === 'colossus')!.maxHp;
    };
    const two = bossHp(2);
    expect(two).toBeGreaterThanOrEqual(colossus.hp);
    for (const row of scaling) expect(bossHp(row.players) / two).toBeCloseTo(row.bossHp, 6);
  });

  it('the difficulty multiplies the respawn', () => {
    for (const d of ['easy', 'hard'] as DifficultyId[]) {
      const h = harness(2, 1, { difficulty: d });
      h.toCombat();
      h.holdSpawns();
      const mult = difficulties.find((x) => x.id === d)!.respawn;
      expect(respawnAfterDeath(h)).toBeCloseTo(10_000 * mult, -2);
    }
  });
});

describe('Quick Recovery floors (§5)', () => {
  const withQr = (players: number, stacks: number, difficulty: DifficultyId = 'normal') => {
    const h = harness(players, 1, { difficulty, content });
    h.toBuild();
    if (stacks > 0) h.give(0, 'quick_recovery', stacks);
    h.toCombat();
    h.holdSpawns();
    return respawnAfterDeath(h);
  };

  it('solo: −2 s a stack, never under 4 s', () => {
    expect(rules.respawnFloorMs).toEqual({ solo: 4000, team: 5000 });
    expect(withQr(1, 0)).toBeCloseTo(6000, -2);
    expect(withQr(1, 1)).toBeCloseTo(4000, -2);
    expect(withQr(1, 3)).toBeCloseTo(4000, -2);
  });

  it('a team: never under 5 s', () => {
    expect(withQr(2, 1)).toBeCloseTo(8000, -2);
    expect(withQr(2, 2)).toBeCloseTo(6000, -2);
    expect(withQr(2, 4)).toBeCloseTo(5000, -2);
  });

  it('the floor never raises a respawn that is already shorter', () => {
    // Easy solo: 6 s × 0.8 = 4.8 s; one stack would make 2.8 s, the floor holds it at 4 s.
    expect(withQr(1, 0, 'easy')).toBeCloseTo(4800, -2);
    expect(withQr(1, 1, 'easy')).toBeCloseTo(4000, -2);
    // A base under the floor (3 s solo) stays 3 s, with or without the card.
    const short = {
      ...content,
      scaling: content.scaling.map((r) => (r.players === 1 ? { ...r, respawnMs: 3000 } : r)),
    };
    for (const stacks of [0, 1]) {
      const h = harness(1, 1, { content: short });
      h.toBuild();
      if (stacks > 0) h.give(0, 'quick_recovery', stacks);
      h.toCombat();
      h.holdSpawns();
      expect(respawnAfterDeath(h)).toBeCloseTo(3000, -2);
    }
  });
});

describe('solo (§11.1)', () => {
  it('one player runs: ready alone starts the wave, at the solo row', () => {
    const h = harness(1, 8);
    h.toBuild();
    h.sim.command({ c: 'ready', slot: 0, ready: true });
    h.run(1);
    expect(h.sim.world.phase).toBe('combat');
    expect(h.sim.world.team.scaling.players).toBe(1);
    expect(h.sim.world.team.scaling.activeCap).toBe(2);
    expect(steps(1000)).toBe(60);
  });
});
