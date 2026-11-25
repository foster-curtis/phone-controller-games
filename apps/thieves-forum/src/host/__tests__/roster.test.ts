import { describe, expect, it } from 'vitest';
import { createRoster } from '../roster';

describe('roster', () => {
  it('keeps join order, renames in place, drops on left', () => {
    const r = createRoster();
    expect(r.join('a', ' Livia ')).toBe('Livia');
    expect(r.join('b', 'Marcus')).toBe('Marcus');
    expect(r.join('c', '   ')).toBeNull();
    r.join('a', 'Livia II');
    expect(r.players().map((p) => p.name)).toEqual(['Livia II', 'Marcus']);
    r.peer({ event: 'rejoined', playerId: 'b' });
    expect(r.players()).toHaveLength(2);
    r.peer({ event: 'left', playerId: 'a' });
    expect(r.players().map((p) => p.id)).toEqual(['b']);
  });
});
