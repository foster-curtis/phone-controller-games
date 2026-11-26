// Ledger by side (SPEC §6.4, §6.13 payout table, §7, §9 prep).
import { describe, expect, it } from 'vitest';
import { balance } from '../../../../content/balance';
import {
  chargeTipFee,
  chargeWrongGrab,
  createLedger,
  roundHauls,
  settleCatch,
  sideKey,
  type Side,
} from '..';

const side = (id: string): Side => ({ kind: 'player', id });
const A = side('a');
const B = side('b');
const C = side('c');

function opened(...sides: Side[]) {
  const l = createLedger();
  for (const s of sides) l.open(s, balance.match.startPurse);
  return l;
}

describe('accounts', () => {
  it('opens a fresh 20 d purse and empty pack each round', () => {
    const l = opened(A);
    expect(l.account(A)).toEqual({ side: A, purse: 20, pack: [], startPurse: 20 });
    l.credit(A, 30);
    l.addItem(A, { item: 'amphora', value: 9, weight: 4 });
    l.open(A, 20);
    expect(l.account(A)).toEqual({ side: A, purse: 20, pack: [], startPurse: 20 });
  });

  it('keys by side value, not object identity', () => {
    const l = opened(A);
    l.credit(side('a'), 5);
    expect(l.account(side('a'))!.purse).toBe(25);
    expect(l.account(B)).toBeNull();
    expect(sideKey(A)).toBe('player:a');
    expect(l.sides()).toEqual([A]);
  });

  it('debits at most what the side has and credits a side payee', () => {
    const l = opened(A, B);
    expect(l.debit(A, 8, B)).toBe(8);
    expect(l.account(A)!.purse).toBe(12);
    expect(l.account(B)!.purse).toBe(28);
    expect(l.debit(A, 50, 'sink')).toBe(12);
    expect(l.account(A)!.purse).toBe(0);
    expect(l.debit(A, 5, 'guard')).toBe(0);
  });

  it('ignores unknown sides and bad amounts', () => {
    const l = opened(A);
    l.credit(B, 10);
    expect(l.debit(B, 10, 'sink')).toBe(0);
    l.credit(A, -5);
    l.credit(A, Number.NaN);
    expect(l.debit(A, -3, 'sink')).toBe(0);
    expect(l.account(A)!.purse).toBe(20);
  });
});

describe('pack', () => {
  it('caps the pack at weight 15', () => {
    const l = opened(A);
    expect(balance.match.packCapacity).toBe(15);
    expect(l.addItem(A, { item: 'rug', value: 40, weight: 10 })).toBe(true);
    expect(l.addItem(A, { item: 'ring', value: 30, weight: 5 })).toBe(true);
    expect(l.packWeight(A)).toBe(15);
    expect(l.addItem(A, { item: 'cup', value: 2, weight: 1 })).toBe(false);
    expect(l.removeItem(A, 'rug')).toEqual({ item: 'rug', value: 40, weight: 10 });
    expect(l.removeItem(A, 'rug')).toBeNull();
    expect(l.packWeight(A)).toBe(5);
    expect(l.addItem(B, { item: 'cup', value: 2, weight: 1 })).toBe(false);
  });
});

describe('haul', () => {
  it('is end bag + full item value − starting purse', () => {
    const l = opened(A);
    l.credit(A, 14);
    l.addItem(A, { item: 'ring', value: 30, weight: 1 });
    expect(l.haul(A)).toBe(34 + 30 - 20);
  });

  it('can be negative', () => {
    const l = opened(A);
    l.debit(A, 12, 'sink');
    expect(l.haul(A)).toBe(-12);
    l.debit(A, 99, 'sink');
    expect(l.haul(A)).toBe(-20);
  });

  it('roundHauls lists every side with bag, items and haul', () => {
    const l = opened(A, B);
    l.addItem(B, { item: 'cup', value: 2, weight: 1 });
    expect(roundHauls(l)).toEqual([
      { side: A, bag: 20, items: [], haul: 0 },
      { side: B, bag: 20, items: [{ item: 'cup', value: 2, weight: 1 }], haul: 2 },
    ]);
  });
});

describe('pot', () => {
  it.each([
    [20, 5],
    [23, 5],
    [27, 6],
    [3, 0],
    [0, 0],
    [101, 25],
  ])('25%% of a %i d bag rounds down to %i', (bag, pot) => {
    const l = createLedger();
    l.open(A, bag);
    expect(l.pot(A, balance.catch.potShare)).toBe(pot);
  });
});

describe('payout table (SPEC §6.13)', () => {
  it('player grab: the catcher gets the whole pot', () => {
    const l = opened(A, B);
    l.credit(A, 20); // 40 d → pot 10
    const s = settleCatch(l, A, { by: 'player', catcher: B });
    expect(s).toEqual({ pot: 10, catcher: 10, tipper: 0, guard: 0 });
    expect(l.account(A)!.purse).toBe(30);
    expect(l.account(B)!.purse).toBe(30);
  });

  it('guard via tip-off: the tipper gets ¼ (rounded down), the guard keeps the rest', () => {
    const l = opened(A, C);
    l.credit(A, 26); // 46 d → pot 11 → tipper 2, guard 9
    const s = settleCatch(l, A, { by: 'tip', tipper: C });
    expect(s).toEqual({ pot: 11, catcher: 0, tipper: 2, guard: 9 });
    expect(l.account(A)!.purse).toBe(35);
    expect(l.account(C)!.purse).toBe(22);
  });

  it('guard spot or alert chase: the guard keeps the whole pot', () => {
    const l = opened(A);
    const s = settleCatch(l, A, { by: 'guard' });
    expect(s).toEqual({ pot: 5, catcher: 0, tipper: 0, guard: 5 });
    expect(l.account(A)!.purse).toBe(15);
  });

  it('a thief with an empty bag pays nothing', () => {
    const l = opened(A, B);
    l.debit(A, 20, 'sink');
    expect(settleCatch(l, A, { by: 'player', catcher: B })).toEqual({
      pot: 0,
      catcher: 0,
      tipper: 0,
      guard: 0,
    });
  });

  it('items are never confiscated', () => {
    const l = opened(A);
    l.addItem(A, { item: 'ring', value: 30, weight: 1 });
    settleCatch(l, A, { by: 'guard' });
    expect(l.account(A)!.pack).toHaveLength(1);
  });

  it('wrong grab costs 12 d, the tip fee 10 d, capped at the bag', () => {
    const l = opened(A, B);
    expect(chargeWrongGrab(l, A)).toBe(12);
    expect(l.account(A)!.purse).toBe(8);
    expect(chargeTipFee(l, B)).toBe(10);
    expect(l.account(B)!.purse).toBe(10);
    expect(chargeWrongGrab(l, A)).toBe(8);
    expect(l.haul(A)).toBe(-20);
  });
});
