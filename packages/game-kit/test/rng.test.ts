import { describe, expect, it } from 'vitest';
import { fnv1a, rngStream } from '../src/rng';

const take = (seed: number, label: string, n: number) => {
  const r = rngStream(seed, label);
  return Array.from({ length: n }, () => r.next());
};

describe('rngStream', () => {
  it('same (seed, label) → same sequence', () => {
    expect(take(42, 'waves:1', 200)).toEqual(take(42, 'waves:1', 200));
    const a = rngStream(7, 'cards:3:0');
    const b = rngStream(7, 'cards:3:0');
    for (let i = 0; i < 50; i++) expect(a.int(0, 9)).toBe(b.int(0, 9));
  });

  it('different labels or seeds give independent streams', () => {
    const base = take(42, 'waves:1', 64);
    for (const other of [
      take(42, 'waves:2', 64),
      take(42, 'combat:1', 64),
      take(43, 'waves:1', 64),
    ]) {
      expect(other).not.toEqual(base);
      // No shared prefix either.
      expect(other.slice(0, 4)).not.toEqual(base.slice(0, 4));
    }
    // Drawing from one stream never shifts another.
    const waves = rngStream(42, 'waves:1');
    const combat = rngStream(42, 'combat:1');
    for (let i = 0; i < 1000; i++) combat.next();
    expect(Array.from({ length: 64 }, () => waves.next())).toEqual(base);
  });

  it('next() is in [0, 1) and roughly uniform', () => {
    const xs = take(1, 'u', 20_000);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const mean = xs.reduce((a, x) => a + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });

  it('int(lo, hi) stays within inclusive bounds and reaches both ends', () => {
    const r = rngStream(9, 'int');
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = r.int(-3, 4);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThanOrEqual(4);
      seen.add(v);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([-3, -2, -1, 0, 1, 2, 3, 4]);
    expect(r.int(5, 5)).toBe(5);
    const swapped = r.int(10, 2);
    expect(swapped).toBeGreaterThanOrEqual(2);
    expect(swapped).toBeLessThanOrEqual(10);
  });

  it('pick returns elements of the array and throws on empty', () => {
    const r = rngStream(3, 'pick');
    const xs = ['a', 'b', 'c'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(r.pick(xs));
    expect([...seen].sort()).toEqual(['a', 'b', 'c']);
    expect(() => r.pick([])).toThrow(RangeError);
  });

  it('is pinned: the first values never change (replays depend on it)', () => {
    expect(take(1, 'combat:1', 3)).toEqual([
      0.5974355649668723, 0.29120573680847883, 0.9578489458654076,
    ]);
    expect(rngStream(1, 'combat:1').int(0, 1_000_000)).toBe(597436);
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
  });
});
