// Seat model (SPEC §6.3.1): ids, per-phone lists, the cap, colors and the seat-key store.
import { describe, expect, it } from 'vitest';
import {
  createSeatKeyStore,
  hasRoom,
  nextSeatIndex,
  parseSeatId,
  pickColor,
  seatId,
  seatKeysStorageKey,
  seatsByPhone,
  seatsOf,
  type SeatHolder,
  type SeatStorage,
} from '..';

const s = (phoneId: string, seat: number, color: string, left = false): SeatHolder => ({
  phoneId,
  seat,
  color,
  left,
});

function memory(): SeatStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('seat ids', () => {
  it('make and parse', () => {
    expect(seatId('p3', 1)).toBe('p3#1');
    expect(parseSeatId('p3#1')).toEqual({ playerId: 'p3', seat: 1 });
    expect(parseSeatId('a#b#2')).toEqual({ playerId: 'a#b', seat: 2 });
    expect(parseSeatId('p3')).toBeNull();
    expect(parseSeatId('#1')).toBeNull();
    expect(parseSeatId('p3#')).toBeNull();
    expect(parseSeatId('p3#-1')).toBeNull();
  });
});

describe('per-phone lists', () => {
  const list = [s('a', 1, 'x'), s('b', 0, 'y'), s('a', 0, 'z'), s('a', 2, 'w', true)];

  it('seatsOf sorts by seat and skips removed seats', () => {
    expect(seatsOf(list, 'a').map((x) => x.seat)).toEqual([0, 1]);
  });

  it('seatsByPhone groups in first-appearance order', () => {
    const g = seatsByPhone(list);
    expect([...g.keys()]).toEqual(['a', 'b']);
    expect(g.get('a')!.map((x) => x.seat)).toEqual([0, 1]);
  });

  it('nextSeatIndex is the lowest free index (removed seats free theirs)', () => {
    expect(nextSeatIndex(list, 'a')).toBe(2);
    expect(nextSeatIndex(list, 'b')).toBe(1);
    expect(nextSeatIndex([s('c', 1, 'x')], 'c')).toBe(0);
  });
});

describe('cap and colors', () => {
  it('hasRoom counts active seats across phones', () => {
    const eight = Array.from({ length: 8 }, (_, i) => s(`p${i % 3}`, i, `c${i}`));
    expect(hasRoom(eight, 8)).toBe(false);
    expect(hasRoom([...eight.slice(1), s('p0', 9, 'c0', true)], 8)).toBe(true);
  });

  it('pickColor is the lowest free palette color', () => {
    const palette = ['r', 'g', 'b'] as const;
    expect(pickColor([], palette)).toBe('r');
    expect(pickColor([s('a', 0, 'r'), s('b', 0, 'b')], palette)).toBe('g');
    expect(pickColor([s('a', 0, 'r', true)], palette)).toBe('r');
    expect(pickColor([s('a', 0, 'r'), s('a', 1, 'g'), s('a', 2, 'b')], palette)).toBeNull();
  });
});

describe('seat-key store', () => {
  it('add / load / remove, scoped by room code', () => {
    const mem = memory();
    const st = createSeatKeyStore(mem, 'ABCD');
    expect(st.load()).toEqual([]);
    st.add({ seat: 1, seatKey: 'k1', name: 'Leo' });
    st.add({ seat: 0, seatKey: 'k0', name: 'Ana' });
    st.add({ seat: 1, seatKey: 'k1b', name: 'Leo' });
    expect(st.load()).toEqual([
      { seat: 0, seatKey: 'k0', name: 'Ana' },
      { seat: 1, seatKey: 'k1b', name: 'Leo' },
    ]);
    expect(createSeatKeyStore(mem, 'WXYZ').load()).toEqual([]);
    st.remove(0);
    st.remove(1);
    expect(mem.data.has(seatKeysStorageKey('ABCD'))).toBe(false);
  });

  it('never throws on junk or blocked storage', () => {
    const mem = memory();
    mem.setItem(seatKeysStorageKey('R'), '{bad');
    expect(createSeatKeyStore(mem, 'R').load()).toEqual([]);
    mem.setItem(
      seatKeysStorageKey('R'),
      JSON.stringify([{ seat: 0 }, { seat: 1, seatKey: 'k', name: 'A' }]),
    );
    expect(createSeatKeyStore(mem, 'R').load()).toEqual([{ seat: 1, seatKey: 'k', name: 'A' }]);
    const blocked: SeatStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const st = createSeatKeyStore(blocked, 'R');
    expect(() => st.add({ seat: 0, seatKey: 'k', name: 'A' })).not.toThrow();
    expect(st.load()).toEqual([]);
    expect(createSeatKeyStore(undefined, 'R').load()).toEqual([]);
  });
});
