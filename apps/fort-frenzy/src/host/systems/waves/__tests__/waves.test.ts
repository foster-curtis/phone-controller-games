// Wave generator (SPEC §9.3, §9.4 scaling, §15.4 `generateWave`, §15.9 wave generator tests).
import { describe, expect, it } from 'vitest';
import {
  generateWave,
  groupsCost,
  playerScale,
  scaleBudget,
  waveRng,
  type WaveInput,
  type WaveGroup,
} from '../index';

type E = 'grunt' | 'runner' | 'swarm' | 'brute' | 'flyer' | 'boss';
const pool: WaveInput<E>['pool'] = [
  { id: 'grunt', cost: 1 },
  { id: 'runner', cost: 1.5 },
  { id: 'swarm', cost: 3, groupSize: 6 },
  { id: 'brute', cost: 5 },
  { id: 'flyer', cost: 2 },
];
const lanes = ['bottom', 'left', 'right'];

const wave = (seed: number, over: Partial<WaveInput<E>> = {}): WaveGroup<E>[] =>
  generateWave<E>({
    budget: 40,
    pool,
    guaranteed: [],
    lanes,
    durationMs: 60_000,
    rng: waveRng(seed, 6),
    ...over,
  });

describe('generateWave', () => {
  it('spends within ±1 of the budget', () => {
    for (let seed = 0; seed < 500; seed++) {
      const budget = 10 + (seed % 50);
      const gs = wave(seed, { budget });
      expect(Math.abs(groupsCost(gs, pool) - budget)).toBeLessThanOrEqual(1);
    }
  });

  it('guaranteed spawns are paid from the budget', () => {
    for (let seed = 0; seed < 200; seed++) {
      const gs = wave(seed, { budget: 20, guaranteed: [{ id: 'brute', count: 2 }] });
      expect(gs.filter((g) => g.id === 'brute').length).toBeGreaterThanOrEqual(2);
      expect(Math.abs(groupsCost(gs, pool) - 20)).toBeLessThanOrEqual(1);
    }
  });

  it('spawns allowed types only', () => {
    const small = pool.filter((p) => p.id === 'grunt' || p.id === 'swarm');
    for (let seed = 0; seed < 200; seed++) {
      for (const g of wave(seed, { pool: small })) expect(['grunt', 'swarm']).toContain(g.id);
    }
  });

  it('guaranteed spawns are present (a boss outside the pool too), with their group size', () => {
    for (let seed = 0; seed < 200; seed++) {
      const gs = wave(seed, {
        guaranteed: [
          { id: 'swarm', count: 2 },
          { id: 'boss', count: 1, lane: 'left' },
        ],
      });
      expect(gs.filter((g) => g.id === 'swarm' && g.count === 6).length).toBeGreaterThanOrEqual(2);
      const boss = gs.filter((g) => g.id === 'boss');
      expect(boss).toEqual([expect.objectContaining({ lane: 'left', count: 1 })]);
    }
  });

  it('substitutes Flyers with ground units, guaranteed ones included', () => {
    for (let seed = 0; seed < 300; seed++) {
      const gs = wave(seed, {
        guaranteed: [{ id: 'flyer', count: 3 }],
        substitute: { flyer: ['grunt', 'runner'] },
      });
      expect(gs.some((g) => g.id === 'flyer')).toBe(false);
      expect(Math.abs(groupsCost(gs, pool) - 40)).toBeLessThanOrEqual(1);
    }
    // Without substitution Flyers do appear.
    const any = Array.from({ length: 50 }, (_, s) => wave(s)).some((gs) =>
      gs.some((g) => g.id === 'flyer'),
    );
    expect(any).toBe(true);
  });

  it('uses open lanes only, spread evenly over them', () => {
    for (let seed = 0; seed < 200; seed++) {
      const open = ['bottom', 'left'];
      const gs = wave(seed, { lanes: open });
      for (const g of gs) expect(open).toContain(g.lane);
      const per = open.map((l) => gs.filter((g) => g.lane === l).length);
      expect(Math.abs(per[0]! - per[1]!)).toBeLessThanOrEqual(1);
    }
    for (const g of wave(3, { lanes: ['bottom'] })) expect(g.lane).toBe('bottom');
  });

  it('spreads groups across the duration', () => {
    for (let seed = 0; seed < 200; seed++) {
      const gs = wave(seed, { budget: 60, durationMs: 80_000 });
      const n = gs.length;
      expect(n).toBeGreaterThan(8);
      const times = gs.map((g) => g.atMs);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      for (const t of times) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThan(80_000);
      }
      // Each group sits in its own slice of the duration, so no gap exceeds two slices.
      const slice = 80_000 / n;
      expect(times[0]!).toBeLessThan(slice);
      expect(times[n - 1]!).toBeGreaterThanOrEqual(80_000 - slice - 1);
      for (let i = 1; i < n; i++)
        expect(times[i]! - times[i - 1]!).toBeLessThanOrEqual(2 * slice + 1);
    }
  });

  it('same seed, same wave; another seed or wave differs', () => {
    const a = wave(42);
    expect(wave(42)).toEqual(a);
    expect(wave(43)).not.toEqual(a);
    expect(wave(42, { rng: waveRng(42, 7) })).not.toEqual(a);
  });

  it('returns nothing for an empty budget and pool', () => {
    expect(wave(1, { budget: 0 })).toEqual([]);
    expect(wave(1, { pool: [] })).toEqual([]);
  });
});

describe('scaling (§9.4)', () => {
  const scaling = { base: 0.5, perPlayer: 0.25 };

  it('multiplies by 0.5 + 0.25 × players', () => {
    expect(playerScale(2, scaling)).toBe(1);
    expect(playerScale(4, scaling)).toBe(1.5);
    expect(playerScale(6, scaling)).toBe(2);
    expect(playerScale(1, scaling)).toBe(0.75);
  });

  it('difficulty multiplies on top', () => {
    expect(scaleBudget(40, 4, scaling)).toBe(60);
    expect(scaleBudget(40, 4, scaling, 1.25)).toBe(75);
  });

  it('a scaled budget scales what the generator spends', () => {
    for (let seed = 0; seed < 100; seed++) {
      const two = groupsCost(wave(seed, { budget: scaleBudget(30, 2, scaling) }), pool);
      const six = groupsCost(wave(seed, { budget: scaleBudget(30, 6, scaling) }), pool);
      expect(Math.abs(two - 30)).toBeLessThanOrEqual(1);
      expect(Math.abs(six - 60)).toBeLessThanOrEqual(1);
    }
  });
});
