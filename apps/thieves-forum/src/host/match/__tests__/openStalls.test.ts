// Open-stall rule (SPEC §6.3, §11 #24): players + 2 clamped 5–10, pawnbroker + jewelry + one of
// bakery/pottery always, seeded, fixed for the match.
import { describe, expect, it } from 'vitest';
import { balance } from '../../../content/balance';
import { LAYOUT } from '../../../content/layout';
import { openStallCount, pickOpenStalls } from '../openStalls';

const shopOf = (id: number) => LAYOUT.stalls[id]!.shop;

describe('open stalls', () => {
  it.each([
    [1, 5],
    [2, 5],
    [3, 5],
    [4, 6],
    [6, 8],
    [8, 10],
    [9, 10],
    [12, 10],
  ])('%i players → %i open', (players, n) => {
    expect(openStallCount(players, balance)).toBe(n);
  });

  it('always opens the pawnbroker, jewelry and one of bakery/pottery', () => {
    const cheap = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      for (let players = 2; players <= 8; players++) {
        const open = pickOpenStalls(seed, players, LAYOUT, balance);
        const shops = open.map(shopOf);
        expect(open).toHaveLength(openStallCount(players, balance));
        expect(new Set(open).size).toBe(open.length);
        expect(open).toEqual([...open].sort((a, b) => a - b));
        expect(shops).toContain('pawnbroker');
        expect(shops).toContain('jewelry');
        expect(shops.includes('bakery') || shops.includes('pottery')).toBe(true);
        for (const s of ['bakery', 'pottery'] as const) if (shops.includes(s)) cheap.add(s);
      }
    }
    expect(cheap).toEqual(new Set(['bakery', 'pottery']));
  });

  it('is seeded: the same seed gives the same set, different seeds vary', () => {
    expect(pickOpenStalls(42, 3, LAYOUT, balance)).toEqual(pickOpenStalls(42, 3, LAYOUT, balance));
    const sets = new Set<string>();
    for (let seed = 1; seed <= 50; seed++)
      sets.add(pickOpenStalls(seed, 3, LAYOUT, balance).join());
    expect(sets.size).toBeGreaterThan(5);
  });

  it('draws the rest from every remaining shop', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      for (const id of pickOpenStalls(seed, 2, LAYOUT, balance)) seen.add(shopOf(id));
    }
    expect(seen.size).toBe(10);
  });

  it('opens every stall at 8 players', () => {
    expect(pickOpenStalls(7, 8, LAYOUT, balance)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
