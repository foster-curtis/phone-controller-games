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

// ---- RD3: hot side, active-portal cap, spawn pulses (§9.3, §9.4, §15.4 rules with `hot` set) ----

const portals = ['bottom-w', 'bottom-e', 'left-n', 'left-s', 'right-n', 'right-s'];
const sides: Record<string, string> = {
  'bottom-w': 'bottom',
  'bottom-e': 'bottom',
  'left-n': 'left',
  'left-s': 'left',
  'right-n': 'right',
  'right-s': 'right',
};

const hotWave = (
  seed: number,
  hot: NonNullable<WaveInput<E>['hot']>,
  cap: number,
  over: Partial<WaveInput<E>> = {},
): WaveGroup<E>[] =>
  wave(seed, { lanes: portals, sides, hot, hotShare: 0.55, activeCap: cap, ...over });

/** The pulses of a wave: groups sharing a spawn time, in time order. */
function pulses(gs: WaveGroup<E>[]): WaveGroup<E>[][] {
  const out: WaveGroup<E>[][] = [];
  for (const g of gs) {
    const last = out[out.length - 1];
    if (last && last[0]!.atMs === g.atMs) last.push(g);
    else out.push([g]);
  }
  return out;
}

/** Changes of the hot side from one pulse to the next. */
function changes(gs: WaveGroup<E>[]): number {
  const ps = pulses(gs);
  let n = 0;
  for (let i = 1; i < ps.length; i++) if (ps[i]![0]!.hot !== ps[i - 1]![0]!.hot) n++;
  return n;
}

/** The share of the wave's cost spent on the side hot at each group's pulse. */
function hotShareOf(gs: WaveGroup<E>[]): number {
  const cost = (g: WaveGroup<E>) => pool.find((p) => p.id === g.id)!.cost;
  let hot = 0;
  let all = 0;
  for (const g of gs) {
    all += cost(g);
    if (sides[g.lane] === g.hot) hot += cost(g);
  }
  return hot / all;
}

describe('generateWave: hot side (RD3)', () => {
  it('every pulse uses at most activeCap portals and at least one hot-side portal', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const cap of [2, 3, 4, 5, 6]) {
        const gs = hotWave(seed, { mode: 'wave', shifts: 1 }, cap, { budget: 50 });
        for (const ps of pulses(gs)) {
          expect(new Set(ps.map((g) => g.lane)).size).toBeLessThanOrEqual(cap);
          expect(ps.some((g) => sides[g.lane] === g.hot)).toBe(true);
          // One hot side per pulse.
          expect(new Set(ps.map((g) => g.hot)).size).toBe(1);
        }
      }
    }
  });

  it('solo (cap 2): one hot-side portal and one other per full pulse', () => {
    for (let seed = 0; seed < 100; seed++) {
      const gs = hotWave(seed, { mode: 'wave', shifts: 0 }, 2, {
        pool: [{ id: 'grunt', cost: 1 }],
        budget: 12,
      });
      for (const ps of pulses(gs)) {
        expect(ps.length).toBeLessThanOrEqual(2);
        if (ps.length === 2) {
          expect(ps.filter((g) => sides[g.lane] === g.hot)).toHaveLength(1);
        }
      }
    }
  });

  it('a full team (cap 6) sees every portal over a wave', () => {
    for (let seed = 0; seed < 100; seed++) {
      const gs = hotWave(seed, { mode: 'wave', shifts: 0 }, 6, { budget: 60 });
      expect(new Set(gs.map((g) => g.lane)).size).toBe(6);
    }
  });

  it('the hot side gets at least half of the budget, within the share ± 0.10', () => {
    for (let seed = 0; seed < 300; seed++) {
      for (const cap of [2, 3, 6]) {
        const share = hotShareOf(hotWave(seed, { mode: 'wave', shifts: 0 }, cap, { budget: 50 }));
        expect(share).toBeGreaterThanOrEqual(0.5);
        expect(Math.abs(share - 0.55)).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it('no shifts: one hot side for the whole wave', () => {
    for (let seed = 0; seed < 100; seed++) {
      const gs = hotWave(seed, { mode: 'wave', shifts: 0 }, 3);
      expect(new Set(gs.map((g) => g.hot)).size).toBe(1);
    }
  });

  it('shifts happen at 1/2, or 1/3 and 2/3, of the duration, each to a different side', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const shifts of [1, 2] as const) {
        const gs = hotWave(seed, { mode: 'wave', shifts }, 3, { budget: 60 });
        const at = (k: number) => (60_000 * k) / (shifts + 1);
        // Pulses in one segment share its side; consecutive segments differ.
        const seg = (ms: number) => [1, 2].filter((k) => k <= shifts && ms >= at(k)).length;
        const bySeg = new Map<number, Set<string>>();
        for (const g of gs) {
          const set = bySeg.get(seg(g.atMs)) ?? new Set<string>();
          set.add(g.hot!);
          bySeg.set(seg(g.atMs), set);
        }
        for (const set of bySeg.values()) expect(set.size).toBe(1);
        for (let k = 1; k <= shifts; k++) {
          const a = bySeg.get(k - 1);
          const b = bySeg.get(k);
          if (a && b) expect([...b][0]).not.toBe([...a][0]);
        }
        expect(changes(gs)).toBeLessThanOrEqual(shifts);
      }
    }
  });

  it('per group: each pulse rolls its own hot side, never the same twice in a row', () => {
    for (let seed = 0; seed < 200; seed++) {
      const gs = hotWave(seed, { mode: 'group' }, 3, { budget: 60 });
      const ps = pulses(gs);
      expect(ps.length).toBeGreaterThan(3);
      for (let i = 1; i < ps.length; i++) expect(ps[i]![0]!.hot).not.toBe(ps[i - 1]![0]!.hot);
      expect(new Set(ps.map((p) => p[0]!.hot)).size).toBeGreaterThan(1);
    }
  });

  it('a pinned guaranteed spawn keeps its lane; the same seed gives the same wave', () => {
    const over = { guaranteed: [{ id: 'brute' as const, count: 2, lane: 'left-n' }] };
    const a = hotWave(5, { mode: 'wave', shifts: 2 }, 4, over);
    expect(a.filter((g) => g.id === 'brute' && g.lane === 'left-n').length).toBeGreaterThanOrEqual(
      2,
    );
    expect(hotWave(5, { mode: 'wave', shifts: 2 }, 4, over)).toEqual(a);
    expect(hotWave(6, { mode: 'wave', shifts: 2 }, 4, over)).not.toEqual(a);
  });

  it('spends within ±1 of the budget and keeps every group at a real lane', () => {
    for (let seed = 0; seed < 200; seed++) {
      const gs = hotWave(seed, { mode: 'group' }, 2 + (seed % 5), { budget: 20 + (seed % 40) });
      expect(Math.abs(groupsCost(gs, pool) - (20 + (seed % 40)))).toBeLessThanOrEqual(1);
      for (const g of gs) expect(portals).toContain(g.lane);
    }
  });
});
