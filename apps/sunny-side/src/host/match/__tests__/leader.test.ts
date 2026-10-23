import { describe, expect, it } from 'vitest';
import { setup } from './fakeSim';

describe('session leader', () => {
  it('the first joiner is leader; phones learn it via isLeader', () => {
    const h = setup();
    h.join('a');
    h.join('b');
    expect(h.match.view().leaderId).toBe('a');
    expect(h.last('a').isLeader).toBe(true);
    expect(h.last('b').isLeader).toBe(false);
  });

  it('Start is ignored with fewer than 2 players', () => {
    const h = setup();
    h.join('a');
    const s = h.last('a');
    expect(s.kind === 'lobby' && s.canStart).toBe(false);
    h.msg('a', { t: 'leader', action: 'start' });
    h.match.hostAction('start');
    expect(h.match.view().phase).toBe('lobby');
    expect(h.sim.rounds).toHaveLength(0);
  });

  it('Start is ignored from non-leaders', () => {
    const h = setup();
    h.join('a');
    h.join('b');
    h.msg('b', { t: 'leader', action: 'start' });
    expect(h.match.view().phase).toBe('lobby');
    const s = h.last('a');
    expect(s.kind === 'lobby' && s.canStart).toBe(true);
    h.msg('a', { t: 'leader', action: 'start' });
    expect(h.match.view().phase).toBe('countdown');
  });

  it('host-side Start works', () => {
    const h = setup();
    h.join('a');
    h.join('b');
    h.match.hostAction('start');
    expect(h.match.view().phase).toBe('countdown');
    expect(h.match.view().round).toBe(1);
  });

  it('leader disconnect → next-earliest connected player; no snap-back on return', () => {
    const h = setup();
    for (const id of ['a', 'b', 'c']) h.join(id);
    h.match.playerLeft('b');
    h.match.playerLeft('a');
    expect(h.match.view().leaderId).toBe('c');
    h.match.playerRejoined('a', 'key-a');
    h.match.playerRejoined('b', 'key-b');
    expect(h.match.view().leaderId).toBe('c');
    expect(h.last('a').isLeader).toBe(false);
    expect(h.last('c').isLeader).toBe(true);
    expect(h.events).toContainEqual({ type: 'leader', playerId: 'c' });
  });

  it('leader leave → next-earliest joined connected player', () => {
    const h = setup();
    for (const id of ['a', 'b', 'c']) h.join(id);
    h.match.hostAction('start');
    h.msg('a', { t: 'leave' });
    expect(h.match.view().leaderId).toBe('b');
  });

  it('with nobody connected the leader is null, and the next connector takes it', () => {
    const h = setup();
    h.join('a');
    h.match.playerLeft('a');
    expect(h.match.view().leaderId).toBeNull();
    h.join('b');
    expect(h.match.view().leaderId).toBe('b');
  });

  it('non-leaders cannot Next / Rematch / Lobby', () => {
    const h = setup();
    h.startGame(['a', 'b']);
    h.eliminate('b');
    expect(h.match.view().phase).toBe('results');
    h.msg('b', { t: 'leader', action: 'next' });
    expect(h.match.view().phase).toBe('results');
    h.msg('a', { t: 'leader', action: 'next' });
    expect(h.match.view().phase).toBe('countdown');
  });
});
