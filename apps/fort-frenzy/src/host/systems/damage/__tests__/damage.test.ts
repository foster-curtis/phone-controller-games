// Damage pipeline stage order (SPEC §15.3).
import { describe, expect, it } from 'vitest';
import { applyDamage, hpStage, reduceBy, type DamageCalcOf, type DamageStages } from '../index';

const calc = (amount: number): DamageCalcOf => ({
  source: 1,
  target: 2,
  amount,
  kind: 'ranged',
  tags: [],
});

describe('applyDamage', () => {
  it('runs stages in order: outgoing → crit → incoming → shields → HP → after', () => {
    const order: string[] = [];
    const target = { hp: 100 };
    const stages: DamageStages = {
      outgoing: () => order.push('outgoing'),
      crit: () => order.push('crit'),
      incoming: () => order.push('incoming'),
      absorb: () => (order.push('absorb'), 0),
      takeHp: (_c, amount) => (order.push('hp'), hpStage(target)(_c, amount)),
      after: () => order.push('after'),
    };
    applyDamage(calc(10), stages);
    expect(order).toEqual(['outgoing', 'crit', 'incoming', 'absorb', 'hp', 'after']);
  });

  it('each stage sees the previous stage’s result', () => {
    const target = { hp: 100 };
    // outgoing +5 flat, then incoming −50%: (10 + 5) × 0.5 = 7.5 (the reverse order would give 10).
    const r = applyDamage(calc(10), {
      outgoing: (c) => void (c.amount += 5),
      incoming: (c) => void (c.amount = reduceBy(c.amount, 0.5)),
      takeHp: hpStage(target),
    });
    expect(r.amount).toBe(7.5);
    expect(target.hp).toBe(92.5);
  });

  it('shields absorb before HP; the result reports both', () => {
    const target = { hp: 100 };
    let shield = 4;
    const r = applyDamage(calc(10), {
      absorb: (_c, amount) => {
        const a = Math.min(shield, amount);
        shield -= a;
        return a;
      },
      takeHp: hpStage(target),
    });
    expect(r).toMatchObject({ amount: 10, absorbed: 4, dealt: 6, killed: false });
    expect(target.hp).toBe(94);
    expect(shield).toBe(0);
  });

  it('modifiers can add tags; the result carries them and the kind', () => {
    const target = { hp: 100 };
    const r = applyDamage(calc(10), {
      outgoing: (c) => void c.tags.push('vs_flyer'),
      takeHp: hpStage(target),
    });
    expect(r.tags).toEqual(['vs_flyer']);
    expect(r.kind).toBe('ranged');
  });

  it('never goes negative, and never heals', () => {
    const target = { hp: 100 };
    const r = applyDamage(calc(10), {
      incoming: (c) => void (c.amount -= 50),
      takeHp: hpStage(target),
    });
    expect(r.amount).toBe(0);
    expect(target.hp).toBe(100);
  });

  it('kills once: HP clamps at 0 and only the killing hit reports killed', () => {
    const target = { hp: 5 };
    const first = applyDamage(calc(10), { takeHp: hpStage(target) });
    expect(first).toMatchObject({ dealt: 5, killed: true });
    expect(target.hp).toBe(0);
    const second = applyDamage(calc(10), { takeHp: hpStage(target) });
    expect(second).toMatchObject({ dealt: 0, killed: false });
  });

  it('the after stage gets the final result (events: charge, stagger, stats, hooks)', () => {
    const target = { hp: 3 };
    let seen: unknown = null;
    applyDamage(calc(10), { takeHp: hpStage(target), after: (r) => (seen = r) });
    expect(seen).toMatchObject({ source: 1, target: 2, amount: 10, dealt: 3, killed: true });
  });

  it('reduceBy clamps the fraction to 0..1', () => {
    expect(reduceBy(10, 0.25)).toBe(7.5);
    expect(reduceBy(10, 2)).toBe(0);
    expect(reduceBy(10, -1)).toBe(10);
  });
});
