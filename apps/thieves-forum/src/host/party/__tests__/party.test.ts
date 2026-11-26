// Party: roster and leader handoff (SPEC §6.18).
import { describe, expect, it } from 'vitest';
import { createRoster, pickLeader, resolveLeader } from '..';

const p = (id: string, connected = true) => ({ id, connected });

describe('leader', () => {
  it('picks the earliest-joined connected player', () => {
    expect(pickLeader([p('a'), p('b')])).toBe('a');
    expect(pickLeader([p('a', false), p('b'), p('c')])).toBe('b');
    expect(pickLeader([p('a', false)])).toBeNull();
    expect(pickLeader([])).toBeNull();
  });

  it('hands off when the leader disconnects or leaves', () => {
    expect(resolveLeader('a', [p('a', false), p('b'), p('c')])).toBe('b');
    expect(resolveLeader('a', [p('b'), p('c')])).toBe('b');
    expect(resolveLeader(null, [p('a'), p('b')])).toBe('a');
  });

  it('does not snap back to an earlier joiner who reconnects', () => {
    expect(resolveLeader('b', [p('a'), p('b'), p('c')])).toBe('b');
  });
});

describe('roster', () => {
  it('keeps join order, renames in place, drops on left', () => {
    const r = createRoster();
    expect(r.join('a', ' Livia ')).toBe('Livia');
    expect(r.join('b', 'Marcus')).toBe('Marcus');
    expect(r.join('c', '   ')).toBeNull();
    r.join('a', 'Livia II');
    expect(r.players().map((x) => x.name)).toEqual(['Livia II', 'Marcus']);
    r.peer({ event: 'rejoined', playerId: 'b' });
    expect(r.players()).toHaveLength(2);
    r.peer({ event: 'left', playerId: 'a' });
    expect(r.players().map((x) => x.id)).toEqual(['b']);
  });

  it('takes the game name cleaner', () => {
    const r = createRoster((raw) => raw.trim().slice(0, 3));
    expect(r.join('a', ' Octavia ')).toBe('Oct');
  });
});
