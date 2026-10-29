// Timed effects: each stacking policy, periodic ticks, expiry, modifiers (SPEC §6.1, §7.1, §15.3).
import { describe, expect, it } from 'vitest';
import {
  activeModifiers,
  applyEffect,
  effectiveStrength,
  msToSteps,
  tickEffects,
  type EffectRule,
  type TimedEffect,
} from '../index';

type E = 'burn' | 'slow' | 'aura' | 'stun';
const rules: Record<E, EffectRule> = {
  burn: { stacking: 'stack', maxStacks: 3, tickEvery: 30 },
  slow: { stacking: 'strongest' },
  aura: { stacking: 'refresh' },
  stun: { stacking: 'refresh' },
};
const rule = (d: E) => rules[d];
const fresh = (): TimedEffect<E>[] => [];

describe('refresh', () => {
  it('keeps one instance and resets its timer (auras re-applied each step)', () => {
    const list = fresh();
    expect(
      applyEffect(list, rules.aura, { def: 'aura', strength: 0.2, duration: 10, source: 1 }),
    ).toBe('added');
    tickEffects(list, rule);
    tickEffects(list, rule);
    expect(list[0]!.remaining).toBe(8);
    expect(
      applyEffect(list, rules.aura, { def: 'aura', strength: 0.2, duration: 10, source: 1 }),
    ).toBe('refreshed');
    expect(list).toHaveLength(1);
    expect(list[0]!.remaining).toBe(10);
  });

  it('never shortens the timer, and keeps the stronger strength', () => {
    const list = fresh();
    applyEffect(list, rules.aura, { def: 'aura', strength: 0.3, duration: 20, source: 1 });
    applyEffect(list, rules.aura, { def: 'aura', strength: 0.1, duration: 5, source: 2 });
    expect(list[0]).toMatchObject({ strength: 0.3, remaining: 20, source: 1, stacks: 1 });
    applyEffect(list, rules.aura, { def: 'aura', strength: 0.5, duration: 5, source: 3 });
    expect(list[0]).toMatchObject({ strength: 0.5, remaining: 20, source: 3 });
  });
});

describe('strongest', () => {
  it("slows don't stack: the strongest applies", () => {
    const list = fresh();
    applyEffect(list, rules.slow, { def: 'slow', strength: 0.4, duration: 120, source: 1 });
    applyEffect(list, rules.slow, { def: 'slow', strength: 0.4, duration: 120, source: 2 });
    expect(list).toHaveLength(1);
    expect(effectiveStrength(list[0]!)).toBe(0.4);
  });

  it('a stronger slow replaces a weaker one with its own duration', () => {
    const list = fresh();
    applyEffect(list, rules.slow, { def: 'slow', strength: 0.2, duration: 300, source: 1 });
    expect(
      applyEffect(list, rules.slow, { def: 'slow', strength: 0.4, duration: 60, source: 2 }),
    ).toBe('replaced');
    expect(list[0]).toMatchObject({ strength: 0.4, remaining: 60, source: 2 });
  });

  it('a weaker slow is ignored; an equal one extends the timer', () => {
    const list = fresh();
    applyEffect(list, rules.slow, { def: 'slow', strength: 0.4, duration: 60, source: 1 });
    expect(
      applyEffect(list, rules.slow, { def: 'slow', strength: 0.2, duration: 600, source: 2 }),
    ).toBe('ignored');
    expect(list[0]).toMatchObject({ strength: 0.4, remaining: 60, source: 1 });
    expect(
      applyEffect(list, rules.slow, { def: 'slow', strength: 0.4, duration: 90, source: 3 }),
    ).toBe('refreshed');
    expect(list[0]!.remaining).toBe(90);
  });
});

describe('stack', () => {
  it('adds stacks up to maxStacks and refreshes the timer', () => {
    const list = fresh();
    expect(
      applyEffect(list, rules.burn, { def: 'burn', strength: 2, duration: 60, source: 1 }),
    ).toBe('added');
    for (let i = 0; i < 5; i++) {
      applyEffect(list, rules.burn, { def: 'burn', strength: 2, duration: 60, source: 1 });
    }
    expect(list).toHaveLength(1);
    expect(list[0]!.stacks).toBe(3);
    expect(effectiveStrength(list[0]!)).toBe(6);
  });

  it('without maxStacks stacks are unbounded', () => {
    const list = fresh();
    const r: EffectRule = { stacking: 'stack' };
    for (let i = 0; i < 10; i++)
      applyEffect(list, r, { def: 'burn', strength: 1, duration: 5, source: null });
    expect(list[0]!.stacks).toBe(10);
  });
});

describe('ticking', () => {
  it('fires periodic ticks every tickEvery steps, including the last, then expires', () => {
    const list = fresh();
    applyEffect(list, rules.burn, { def: 'burn', strength: 2, duration: 120, source: 7 });
    const ticks: number[] = [];
    let step = 0;
    const expired: TimedEffect<E>[] = [];
    while (list.length > 0 && step < 1000) {
      step++;
      expired.push(
        ...tickEffects(list, rule, (e) => {
          ticks.push(step);
          expect(effectiveStrength(e)).toBe(2);
        }),
      );
    }
    expect(ticks).toEqual([30, 60, 90, 120]);
    expect(step).toBe(120);
    expect(expired.map((e) => e.def)).toEqual(['burn']);
  });

  it('effects without tickEvery never fire periodic ticks', () => {
    const list = fresh();
    applyEffect(list, rules.stun, { def: 'stun', strength: 1, duration: 3, source: null });
    let fired = 0;
    for (let i = 0; i < 3; i++) tickEffects(list, rule, () => fired++);
    expect(fired).toBe(0);
    expect(list).toHaveLength(0);
  });

  it('keeps application order when effects expire', () => {
    const list = fresh();
    applyEffect(list, rules.stun, { def: 'stun', strength: 1, duration: 1, source: null });
    applyEffect(list, rules.slow, { def: 'slow', strength: 0.4, duration: 5, source: null });
    applyEffect(list, rules.aura, { def: 'aura', strength: 1, duration: 5, source: null });
    tickEffects(list, rule);
    expect(list.map((e) => e.def)).toEqual(['slow', 'aura']);
  });

  it('builds modifiers from effective strength in application order', () => {
    const list = fresh();
    applyEffect(list, rules.slow, { def: 'slow', strength: 0.4, duration: 5, source: null });
    applyEffect(list, rules.burn, { def: 'burn', strength: 2, duration: 5, source: null });
    applyEffect(list, rules.burn, { def: 'burn', strength: 2, duration: 5, source: null });
    const mods = activeModifiers(list, (def, s) => ({ id: `effect:${def}`, s }));
    expect(mods).toEqual([
      { id: 'effect:slow', s: 0.4 },
      { id: 'effect:burn', s: 4 },
    ]);
  });

  it('converts ms to whole steps', () => {
    expect(msToSteps(2000, 60)).toBe(120);
    expect(msToSteps(500, 60)).toBe(30);
    expect(msToSteps(10, 60)).toBe(1);
    expect(msToSteps(0, 60)).toBe(0);
  });
});
