import { describe, expect, it } from 'vitest';
import { getPlayerKey } from '../src/api';
import { MemoryStorage } from './fakes';

describe('getPlayerKey', () => {
  it('is stable per (game, code)', () => {
    const storage = new MemoryStorage();
    const a = getPlayerKey('ABCD', storage, 'sunny-side');
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(getPlayerKey('ABCD', storage, 'sunny-side')).toBe(a);
  });

  it('differs across codes and games', () => {
    const storage = new MemoryStorage();
    const a = getPlayerKey('ABCD', storage, 'sunny-side');
    expect(getPlayerKey('WXYZ', storage, 'sunny-side')).not.toBe(a);
    expect(getPlayerKey('ABCD', storage, 'other-game')).not.toBe(a);
  });

  it('survives a reload (read back from storage)', () => {
    const storage = new MemoryStorage();
    const a = getPlayerKey('ABCD', storage, 'g');
    const reloaded = new MemoryStorage();
    for (const [k, v] of storage.map) reloaded.setItem(k, v);
    expect(getPlayerKey('ABCD', reloaded, 'g')).toBe(a);
  });

  it('stays stable for the page when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {},
    };
    const a = getPlayerKey('QQQQ', broken, 'g');
    expect(getPlayerKey('QQQQ', broken, 'g')).toBe(a);
  });
});
