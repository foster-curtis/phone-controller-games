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
    h.readyAll();
    h.match.hostAction('start');
    expect(h.match.view().phase).toBe('lobby');
    expect(h.sim.rounds).toHaveLength(0);
  });

  it('Start is ignored from non-leaders', () => {
    const h = setup();
    h.join('a');
    h.join('b');
    h.msg('b', { t: 'ready', ready: true });
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
    h.readyAll();
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
    h.readyAll();
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

  it('lobby Start waits until every connected non-leader is ready; un-ready blocks it again', () => {
    const h = setup();
    for (const id of ['a', 'b', 'c']) h.join(id);
    const canStart = () => {
      const s = h.last('a');
      return s.kind === 'lobby' && s.canStart;
    };
    expect(canStart()).toBe(false);
    h.msg('b', { t: 'ready', ready: true });
    expect(canStart()).toBe(false);
    expect(h.match.view().canStart).toBe(false);
    h.msg('a', { t: 'leader', action: 'start' });
    expect(h.match.view().phase).toBe('lobby');
    h.msg('c', { t: 'ready', ready: true });
    expect(canStart()).toBe(true);
    expect(h.last('c')).toMatchObject({ kind: 'lobby', ready: true });
    expect(h.last('a').standings.find((s) => s.playerId === 'c')?.ready).toBe(true);
    h.msg('c', { t: 'ready', ready: false });
    expect(canStart()).toBe(false);
    h.match.hostAction('start');
    expect(h.match.view().phase).toBe('lobby');
    // An away player doesn't block Start.
    h.match.playerLeft('c');
    expect(canStart()).toBe(true);
    h.msg('a', { t: 'leader', action: 'start' });
    expect(h.match.view().phase).toBe('countdown');
  });

  it('a ready player keeps their name and color; ready clears when the match starts', () => {
    const h = setup();
    h.join('a');
    h.join('b');
    h.msg('b', { t: 'ready', ready: true });
    const before = h.match.view().players.find((p) => p.id === 'b')!;
    h.msg('b', { t: 'profile', name: 'Bee', color: 'sky' });
    expect(h.match.view().players.find((p) => p.id === 'b')).toMatchObject({
      name: before.name,
      color: before.color,
    });
    h.msg('b', { t: 'ready', ready: false });
    h.msg('b', { t: 'profile', name: 'Bee', color: 'sky' });
    expect(h.match.view().players.find((p) => p.id === 'b')).toMatchObject({
      name: 'Bee',
      color: 'sky',
    });
    h.msg('b', { t: 'ready', ready: true });
    h.msg('a', { t: 'leader', action: 'start' });
    expect(h.match.view().players.every((p) => !p.ready)).toBe(true);
    h.msg('b', { t: 'ready', ready: true }); // ignored outside the lobby
    expect(h.match.view().players.find((p) => p.id === 'b')!.ready).toBe(false);
  });

  it('the leader picks the difficulty in the lobby; it sizes the pan via startRound', () => {
    const h = setup();
    h.join('a');
    h.join('b');
    expect(h.last('b')).toMatchObject({ kind: 'lobby', difficulty: 'medium' });
    h.msg('b', { t: 'leader', action: 'difficulty', difficulty: 'easy' }); // not the leader
    expect(h.match.view().difficulty).toBe('medium');
    h.msg('a', { t: 'leader', action: 'difficulty', difficulty: 'nope' });
    expect(h.match.view().difficulty).toBe('medium');
    h.msg('a', { t: 'leader', action: 'difficulty', difficulty: 'hard' });
    expect(h.match.view().difficulty).toBe('hard');
    expect(h.last('b')).toMatchObject({ kind: 'lobby', difficulty: 'hard' });
    h.readyAll();
    h.match.hostAction('start');
    expect(h.sim.roundOpts.at(-1)).toEqual({ difficulty: 'hard' });
    h.match.hostAction({ kind: 'difficulty', difficulty: 'easy' }); // ignored mid-match
    expect(h.match.view().difficulty).toBe('hard');
  });
});
