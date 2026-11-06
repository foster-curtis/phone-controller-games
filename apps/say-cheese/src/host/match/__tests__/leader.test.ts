// Session leader (SPEC §6.5, §6.3.1): first joiner, handoff, no snap-back, leader-only actions.
import { describe, expect, it } from 'vitest';
import { lobbyOf, setup, started } from './harness';

describe('leader', () => {
  it('is the first joiner’s phone, named by its first seat', () => {
    const h = setup();
    h.connect('a'); // seatless phones don't lead
    h.join('b', 'Bo');
    h.msg('a', { t: 'profile', seat: 0, name: 'Ana' });
    expect(h.m.state.leader).toBe('b');
    expect(h.m.screenFor('b')).toMatchObject({ isLeader: true, leaderName: 'Bo' });
    expect(h.m.screenFor('a')).toMatchObject({ isLeader: false, leaderName: 'Bo' });
    expect(h.m.tvView()).toMatchObject({ leaderName: 'Bo' });
  });

  it('hands off to the next-earliest connected phone, with no snap-back', () => {
    const h = lobbyOf(3);
    h.disconnect('p1');
    expect(h.m.state.leader).toBe('p2');
    h.rejoin('p1');
    expect(h.m.state.leader).toBe('p2');
    h.disconnect('p2');
    expect(h.m.state.leader).toBe('p1');
  });

  it('only the leader’s phone can send leader actions', () => {
    const h = lobbyOf(3);
    h.msg('p2', { t: 'leader', action: 'howToPlay' });
    expect(h.m.state.phase).toBe('lobby');
    h.msg('p2', { t: 'leader', action: 'remove', playerId: 'p3#0' });
    expect(h.m.state.players).toHaveLength(3);
  });

  it('leader remove works per seat', () => {
    const h = lobbyOf(3);
    h.msg('p3', { t: 'addSeat', name: 'Kid', seatKey: 'kk' });
    h.msg('p1', { t: 'leader', action: 'remove', playerId: 'p3#1' });
    expect(h.m.state.players.map((p) => p.id)).toEqual(['p1#0', 'p2#0', 'p3#0']);
  });

  it('a leader leaving mid-match hands off too', () => {
    const h = started(3);
    h.msg('p1', { t: 'leave' });
    expect(h.m.state.leader).toBe('p2');
  });
});
