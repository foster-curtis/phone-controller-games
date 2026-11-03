// Stat stacking and caps, hook order, module definitions (SPEC §6.1 stat math, §15.3).
import { describe, expect, it } from 'vitest';
import {
  collectStatMods,
  computeStats,
  defineModule,
  hookList,
  statValue,
  type StatCaps,
  type StatMod,
} from '../index';

type S = 'damage' | 'range' | 'moveSpeed' | 'maxHp';
const base: Record<S, number> = { damage: 10, range: 5, moveSpeed: 4, maxHp: 100 };
const caps: StatCaps<S> = { range: { pctMax: 0.4 }, moveSpeed: { pctMax: 0.4, pctMin: -0.6 } };

describe('stat stacking', () => {
  it('no mods = base value', () => {
    expect(computeStats(base, [], caps)).toEqual(base);
  });

  it('stacks add percentages of the base, never multiply', () => {
    const mods: StatMod<S>[] = [0, 1, 2].map(() => ({ stat: 'damage', addPct: 0.1 }));
    expect(statValue(10, mods, 'damage')).toBeCloseTo(13); // 10 × 1.3, not 10 × 1.1³ = 13.31
  });

  it('flat adds apply after the percentage', () => {
    const mods: StatMod<S>[] = [
      { stat: 'maxHp', add: 20 },
      { stat: 'maxHp', addPct: 0.5 },
      { stat: 'maxHp', add: 5 },
    ];
    expect(statValue(100, mods, 'maxHp')).toBe(175); // 100 × 1.5 + 25
  });

  it('only mods for the stat count', () => {
    const mods: StatMod<S>[] = [{ stat: 'damage', addPct: 1 }];
    expect(computeStats(base, mods, caps).range).toBe(5);
  });

  it('caps clamp the summed percentage (+40% for range)', () => {
    const mods: StatMod<S>[] = [0, 1, 2, 3, 4].map(() => ({ stat: 'range', addPct: 0.15 }));
    expect(computeStats(base, mods, caps).range).toBeCloseTo(7); // 5 × 1.4, not 5 × 1.75
  });

  it('a floor clamps negative stacks', () => {
    const mods: StatMod<S>[] = [
      { stat: 'moveSpeed', addPct: -0.5 },
      { stat: 'moveSpeed', addPct: -0.5 },
    ];
    expect(computeStats(base, mods, caps).moveSpeed).toBeCloseTo(1.6); // 4 × (1 − 0.6)
  });

  it('flat add caps clamp the summed add', () => {
    const mods: StatMod<S>[] = [
      { stat: 'maxHp', add: 80 },
      { stat: 'maxHp', add: 80 },
    ];
    expect(statValue(100, mods, 'maxHp', { addMax: 100 })).toBe(200);
  });

  it('uncapped stats are unbounded', () => {
    const mods: StatMod<S>[] = [0, 1, 2, 3, 4].map(() => ({ stat: 'damage', addPct: 0.5 }));
    expect(computeStats(base, mods, caps).damage).toBeCloseTo(35);
  });

  it('scope: unscoped mods apply everywhere, scoped ones only to that scope', () => {
    const mods: StatMod<S>[] = [
      { stat: 'damage', addPct: 0.1 },
      { stat: 'damage', addPct: 0.5, scope: 'main' },
      { stat: 'damage', addPct: 1, scope: 'super' },
    ];
    expect(computeStats(base, mods, caps).damage).toBeCloseTo(11);
    expect(computeStats(base, mods, caps, 'main').damage).toBeCloseTo(16);
    expect(computeStats(base, mods, caps, 'super').damage).toBeCloseTo(21);
  });

  it('collects stat mods from modifiers in attach order', () => {
    const a = { id: 'card:might', stats: [{ stat: 'damage', addPct: 0.1 } as StatMod<S>] };
    const b = { id: 'passive:x' };
    const c = { id: 'card:reach', stats: [{ stat: 'range', add: 1 } as StatMod<S>] };
    expect(collectStatMods([a, b, a, c]).map((m) => m.stat)).toEqual(['damage', 'damage', 'range']);
  });
});

describe('hooks', () => {
  interface H {
    onTick(log: string[]): void;
    onKill(log: string[]): void;
  }
  const mod = (id: string, hooks?: Partial<H>) => ({ id, hooks });

  it('runs unit mods in attach order, then effects in application order', () => {
    const log: string[] = [];
    const mods = [
      mod('a', { onTick: (l) => l.push('a') }),
      mod('b'),
      mod('c', { onTick: (l) => l.push('c'), onKill: (l) => l.push('c-kill') }),
    ];
    const effects = [mod('burn', { onTick: (l) => l.push('burn') }), mod('slow')];
    for (const fn of hookList<H, 'onTick'>([mods, effects], 'onTick')) fn(log);
    expect(log).toEqual(['a', 'c', 'burn']);
  });
});

describe('modules', () => {
  it('defineModule builds modifiers from params', () => {
    const def = defineModule('passive:mason', (p: { radius: number }) => ({
      id: 'passive:mason',
      stats: [{ stat: 'range' as const, add: p.radius }],
    }));
    expect(def.id).toBe('passive:mason');
    expect(def.make({ radius: 3 }).stats?.[0]?.add).toBe(3);
  });
});
