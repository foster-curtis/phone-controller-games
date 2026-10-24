import { describe, expect, it } from 'vitest';
import { STORAGE_KEY } from '../config';
import { loadPersisted } from '../persist';
import { MemStorage, setup } from './fakeSim';

describe('host-refresh restore', () => {
  it('persist → restore puts roster/scores/leader/round back and lands on results', () => {
    const storage = new MemStorage();
    const h1 = setup(storage);
    for (const id of ['a', 'b', 'c']) h1.join(id);
    h1.msg('b', { t: 'profile', name: 'Benedict', color: 'sky' });
    h1.match.hostAction('start');
    h1.runMs(3000);
    h1.eliminate('c', 'b');
    h1.eliminate('a', 'b'); // b: 1 + 1 + 3
    h1.match.hostAction('next');
    h1.runMs(3000); // round 2 in progress
    h1.match.playerLeft('a'); // leader drops → b leads
    expect(h1.match.view().leaderId).toBe('b');

    // Host tab refreshes: a brand-new match restores from storage after reclaim.
    const h2 = setup(storage);
    h2.match.restore([
      { playerId: 'a', playerKey: 'key-a', connected: false },
      { playerId: 'b', playerKey: 'key-b', connected: true },
      { playerId: 'c', playerKey: 'key-c', connected: true },
    ]);
    const v = h2.match.view();
    expect(v.phase).toBe('results');
    expect(v.round).toBe(2);
    expect(v.targetScore).toBe(13);
    expect(v.leaderId).toBe('b');
    expect(v.players.map((p) => [p.id, p.name, p.color, p.score, p.connected])).toEqual([
      ['a', 'Egg 1', 'crimson', 0, false],
      ['b', 'Benedict', 'sky', 5, true],
      ['c', 'Egg 3', 'jade', 0, true],
    ]);
    expect(h2.last('b')).toMatchObject({ kind: 'results', isLeader: true, round: 2 });
    expect(h2.last('c').kind).toBe('results');
    expect(h2.screensOf('a')).toHaveLength(0);
    // and play resumes
    h2.msg('b', { t: 'leader', action: 'next' });
    expect(h2.match.view()).toMatchObject({ phase: 'countdown', round: 3 });
    expect(h2.sim.lastRound.map((e) => e.id)).toEqual(['b', 'c']);
  });

  it('a player who left is not restored, and unknown peers join as spectators', () => {
    const storage = new MemStorage();
    const h1 = setup(storage);
    h1.startGame(['a', 'b', 'c', 'd']);
    h1.eliminate('d', 'c'); // c +1
    h1.msg('c', { t: 'leave' });
    const h2 = setup(storage);
    h2.match.restore([
      { playerId: 'a', playerKey: 'key-a', connected: true },
      { playerId: 'b', playerKey: 'key-b', connected: true },
      { playerId: 'd', playerKey: 'key-d', connected: true },
      { playerId: 'n', playerKey: 'key-n', connected: true },
    ]);
    const players = h2.match.view().players;
    expect(players.map((p) => p.id)).toEqual(['a', 'b', 'd', 'n']);
    expect(players.find((p) => p.id === 'n')).toMatchObject({ spectating: true, joinIndex: 4 });
    expect(h2.last('n').standings.map((s) => s.playerId)).not.toContain('c');
  });

  it('matches peers by player key when ids changed', () => {
    const storage = new MemStorage();
    const h1 = setup(storage);
    h1.startGame(['a', 'b']);
    const h2 = setup(storage);
    h2.match.restore([
      { playerId: 'a9', playerKey: 'key-a', connected: true },
      { playerId: 'b', playerKey: 'key-b', connected: true },
    ]);
    expect(h2.match.view().players.map((p) => p.id)).toEqual(['a9', 'b']);
    expect(h2.match.view().leaderId).toBe('a9');
  });

  it('a lobby (round 0) restores to the lobby; a finished match to matchEnd', () => {
    const storage = new MemStorage();
    const h1 = setup(storage);
    h1.join('a');
    h1.join('b');
    const h2 = setup(storage);
    h2.match.restore([
      { playerId: 'a', playerKey: 'key-a', connected: true },
      { playerId: 'b', playerKey: 'key-b', connected: true },
    ]);
    expect(h2.match.view().phase).toBe('lobby');
    expect(h2.last('a').kind).toBe('lobby');

    const s2 = new MemStorage();
    const h3 = setup(s2);
    h3.startGame(['a', 'b']);
    for (let r = 0; r < 4; r++) {
      h3.eliminate('b', 'a');
      if (h3.match.view().phase === 'results') {
        h3.match.hostAction('next');
        h3.runMs(3000);
      }
    }
    expect(h3.match.view().phase).toBe('matchEnd');
    const h4 = setup(s2);
    h4.match.restore([
      { playerId: 'a', playerKey: 'key-a', connected: true },
      { playerId: 'b', playerKey: 'key-b', connected: true },
    ]);
    expect(h4.match.view()).toMatchObject({ phase: 'matchEnd', winnerId: 'a' });
  });

  it('missing or malformed storage → a fresh lobby from the roster', () => {
    const storage = new MemStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    expect(loadPersisted(storage)).toBeNull();
    storage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, round: 'x' }));
    expect(loadPersisted(storage)).toBeNull();
    const h = setup(storage);
    h.match.restore([
      { playerId: 'a', playerKey: 'key-a', connected: true },
      { playerId: 'b', playerKey: 'key-b', connected: true },
    ]);
    expect(h.match.view()).toMatchObject({ phase: 'lobby', round: 0, leaderId: 'a' });
    expect(h.last('b').kind).toBe('lobby');
  });

  it('storage errors never throw', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    const h = setup(throwing);
    h.join('a');
    h.match.restore([{ playerId: 'a', playerKey: 'key-a', connected: true }]);
    expect(h.match.view().players).toHaveLength(1);
  });
});
