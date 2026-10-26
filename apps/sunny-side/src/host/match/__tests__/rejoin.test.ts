import { describe, expect, it } from 'vitest';
import { setup } from './fakeSim';

describe('late rejoin by player key', () => {
  it('restores name/color/score and spectates until the next round', () => {
    const h = setup();
    h.join('a');
    h.join('b');
    h.msg('b', { t: 'profile', name: 'Yolko', color: 'rose' });
    h.readyAll();
    h.match.hostAction('start');
    h.runMs(3000);
    h.eliminate('a', 'b'); // b +1 +3
    h.match.hostAction('next');
    h.runMs(3000);
    h.match.playerLeft('b'); // window expires; relay later reports a fresh join
    h.join('b2', 'key-b');
    const s = h.last('b2');
    expect(s).toMatchObject({ kind: 'spectating', name: 'Yolko', color: 'rose' });
    expect(s.standings.find((x) => x.playerId === 'b2')).toMatchObject({ score: 4 });
    const v = h.match.view();
    expect(v.players).toHaveLength(2);
    expect(v.players[1]).toMatchObject({ id: 'b2', spectating: true, connected: true, score: 4 });
  });

  it("the old egg stays as an obstacle: it doesn't keep the round alive, KO credit still counts", () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.match.playerLeft('b');
    h.join('b2', 'key-b');
    // old egg 'b' still on the pan, owner now spectates as b2
    h.eliminate('b', 'a');
    expect(h.score('a')).toBe(1);
    expect(h.last('b2').kind).toBe('spectating');
    h.eliminate('c', 'b'); // credit from the old egg goes to the returning player
    expect(h.score('b2')).toBe(1);
    expect(h.match.view().phase).toBe('results');
    expect(h.match.view().survivorId).toBe('a');
  });

  it('a stale egg alone ends the round with no +3', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.match.playerLeft('a');
    h.join('a2', 'key-a');
    h.msg('c', { t: 'leave' }); // c's egg is taken off the pan
    // remaining eggs: a (stale), b (live)
    expect(h.match.view().phase).toBe('playing');
    h.eliminate('b', null);
    expect(h.match.view().phase).toBe('results');
    expect(h.match.view().survivorId).toBeNull();
  });

  it('rejoin by key in the lobby is a plain lobby join', () => {
    const h = setup();
    h.join('a');
    h.join('b');
    h.match.playerLeft('b');
    h.join('b2', 'key-b');
    expect(h.last('b2').kind).toBe('lobby');
    expect(h.match.view().players.map((p) => p.id)).toEqual(['a', 'b2']);
  });

  it('a relay rejoin for an unknown id is treated as a join', () => {
    const h = setup();
    h.match.playerRejoined('x', 'key-x');
    expect(h.match.view().players.map((p) => p.id)).toEqual(['x']);
    expect(h.last('x').kind).toBe('lobby');
  });
});
