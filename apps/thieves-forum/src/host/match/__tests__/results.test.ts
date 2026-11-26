// Results (SPEC §6.4 match total, §6.14 reveal order and crowns, §6.15 podium ties).
import { describe, expect, it } from 'vitest';
import { matchTotals, revealOrder, topEarners } from '../results';
import type { RoundHaul, RoundResult, Side } from '../types';

const s = (id: string): Side => ({ kind: 'player', id });
const h = (id: string, haul: number): RoundHaul => ({ side: s(id), bag: 0, items: [], haul });
const r = (round: number, ...hauls: RoundHaul[]): RoundResult => ({ round, hauls });

describe('reveal', () => {
  it('orders lowest haul → highest, ties in given order', () => {
    const order = revealOrder([h('a', 30), h('b', -4), h('c', 30), h('d', 12)]);
    expect(order.map((x) => x.side.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('crowns every tied top earner', () => {
    expect(topEarners([h('a', 30), h('b', -4), h('c', 30)]).map((x) => x.id)).toEqual(['a', 'c']);
    expect(topEarners([h('a', -3), h('b', -9)]).map((x) => x.id)).toEqual(['a']);
    expect(topEarners([])).toEqual([]);
  });
});

describe('match totals', () => {
  it('sums the round hauls, negative ones included', () => {
    const t = matchTotals([
      r(1, h('a', 10), h('b', -5)),
      r(2, h('a', -12), h('b', 20)),
      r(3, h('a', 7), h('b', 0)),
    ]);
    expect(t.map((x) => [x.side.id, x.total, x.place, x.tied])).toEqual([
      ['b', 15, 1, false],
      ['a', 5, 2, false],
    ]);
  });

  it('counts only the rounds a late joiner played', () => {
    const t = matchTotals([
      r(1, h('a', 10)),
      r(2, h('a', 10), h('c', 15)),
      r(3, h('a', 0), h('c', 4)),
    ]);
    expect(t.find((x) => x.side.id === 'c')!.total).toBe(19);
    expect(t.find((x) => x.side.id === 'a')!.total).toBe(20);
  });

  it('ties share a place and skip the next (1, 1, 3)', () => {
    const t = matchTotals([r(1, h('a', 9), h('b', 20), h('c', 20), h('d', 9), h('e', 1))]);
    expect(t.map((x) => [x.side.id, x.place, x.tied])).toEqual([
      ['b', 1, true],
      ['c', 1, true],
      ['a', 3, true],
      ['d', 3, true],
      ['e', 5, false],
    ]);
  });

  it('limits to the given sides, keeping their order for ties', () => {
    const t = matchTotals([r(1, h('a', 5), h('b', 5), h('gone', 50))], [s('b'), s('a')]);
    expect(t.map((x) => x.side.id)).toEqual(['b', 'a']);
    expect(t.every((x) => x.place === 1)).toBe(true);
  });
});
