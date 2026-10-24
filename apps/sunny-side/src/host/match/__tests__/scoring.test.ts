import { describe, expect, it } from 'vitest';
import { Roster } from '../roster';
import { findWinner, roundOutcome, targetScoreFor } from '../scoring';
import { setup } from './fakeSim';

describe('target score', () => {
  it('follows the Build decisions table', () => {
    expect(targetScoreFor(2)).toBe(15);
    expect(targetScoreFor(3)).toBe(13);
    expect(targetScoreFor(4)).toBe(12);
    for (const n of [5, 6, 7, 8]) expect(targetScoreFor(n)).toBe(11);
  });

  it('is fixed at match start from the players who got eggs', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    expect(h.match.view().targetScore).toBe(13);
    h.join('d');
    expect(h.match.view().targetScore).toBe(13);
    expect(h.last('d').targetScore).toBe(13);
  });

  it('lobby shows the live target for the current player count', () => {
    const h = setup();
    h.join('a');
    h.join('b');
    expect(h.last('a').targetScore).toBe(15);
    h.join('c');
    h.join('d');
    expect(h.last('a').targetScore).toBe(12);
  });
});

describe('knockouts and survivor', () => {
  it('elimination with credit → +1, with null → +0', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.eliminate('c', 'a');
    expect(h.score('a')).toBe(1);
    expect(h.events).toContainEqual({ type: 'score', playerId: 'a', delta: 1, reason: 'knockout' });
    const before = h.match.view().players.map((p) => p.score);
    h.match.hostAction('next');
    h.runMs(3000);
    h.eliminate('c', null);
    expect(h.match.view().players.map((p) => p.score)).toEqual(before);
  });

  it('sole survivor → +3 and results name them', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.eliminate('c', 'a');
    expect(h.match.view().phase).toBe('playing');
    h.eliminate('b', 'a');
    expect(h.score('a')).toBe(1 + 1 + 3);
    expect(h.events).toContainEqual({ type: 'score', playerId: 'a', delta: 3, reason: 'survivor' });
    const s = h.last('b');
    expect(s.kind).toBe('results');
    if (s.kind !== 'results') throw new Error();
    expect(s.survivorId).toBe('a');
    expect(s.standings[0]).toMatchObject({ playerId: 'a', score: 5 });
  });

  it('everyone out in the same step → no +3', () => {
    const h = setup();
    h.startGame(['a', 'b']);
    h.sim.queue(
      { type: 'eliminated', id: 'a', by: 'b', respawnMs: 5000, byGhost: false },
      { type: 'eliminated', id: 'b', by: 'a', respawnMs: 5000, byGhost: false },
    );
    h.step();
    expect(h.match.view().phase).toBe('results');
    expect(h.match.view().survivorId).toBeNull();
    expect(h.score('a')).toBe(1);
    expect(h.score('b')).toBe(1);
  });

  it('self-knockout credit is ignored', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.eliminate('a', 'a');
    expect(h.score('a')).toBe(0);
  });

  it('a Leave takes the egg off the pan; ≤1 egg left ends the round (+3 rule)', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.msg('b', { t: 'leave' });
    expect(h.match.view().phase).toBe('playing');
    h.msg('c', { t: 'leave' });
    // only a's egg is left on the pan: round over, a is the sole survivor
    expect(h.match.view().phase).toBe('results');
    expect(h.match.view().survivorId).toBe('a');
    expect(h.score('a')).toBe(3);
  });

  it('round ends when no remaining egg belongs to a connected/reconnecting player', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    // a and b drop and late-rejoin under new ids: their old eggs are stale obstacles
    h.match.playerLeft('a');
    h.join('a2', 'key-a');
    h.match.playerLeft('b');
    h.join('b2', 'key-b');
    expect(h.match.view().phase).toBe('playing');
    h.eliminate('c', 'a');
    expect(h.match.view().phase).toBe('results');
    // stale eggs never get +3; KO credit still goes to the returning owner
    expect(h.match.view().survivorId).toBeNull();
    expect(h.score('a2')).toBe(1);
  });

  it('a disconnected (reconnecting) player keeps the round going and can still win +3', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.match.playerLeft('a');
    h.eliminate('b', 'c');
    h.eliminate('c', null);
    expect(h.match.view().phase).toBe('results');
    expect(h.score('a')).toBe(3);
  });

  it('a sole survivor who left gets no +3', () => {
    const r = new Roster();
    const a = r.add('a', 'ka');
    r.add('b', 'kb');
    a.left = true;
    const out = roundOutcome(r, new Set(['a']));
    expect(out).toEqual({ over: true, survivor: null });
  });
});

describe('match end', () => {
  it('highest ≥ target wins; a tie at the top → another round', () => {
    const r = new Roster();
    const a = r.add('a', 'ka');
    const b = r.add('b', 'kb');
    a.score = 15;
    b.score = 15;
    expect(findWinner(r.players, 15)).toBeNull();
    b.score = 16;
    expect(findWinner(r.players, 15)).toBe(b);
    b.score = 14;
    a.score = 14;
    expect(findWinner(r.players, 15)).toBeNull();
  });

  it('a tie at the top in play → results, then the next round decides; match-end screen', () => {
    const h = setup();
    h.startGame(['a', 'b']);
    // Rounds alternate: whoever survives gets +3, plus +1 for the knockout.
    const playRound = (winner: string, loser: string) => {
      h.eliminate(loser, winner);
      if (h.match.view().phase === 'results') {
        h.match.hostAction('next');
        h.runMs(3000);
      }
    };
    playRound('a', 'b'); // a 4
    playRound('b', 'a'); // b 4
    playRound('a', 'b'); // a 8
    playRound('b', 'a'); // b 8
    playRound('a', 'b'); // a 12
    playRound('b', 'a'); // b 12
    h.eliminate('b', 'a'); // a 16 ≥ 15 alone
    expect(h.score('a')).toBe(16);
    expect(h.match.view().phase).toBe('matchEnd');
    expect(h.match.view().winnerId).toBe('a');
    const s = h.last('b');
    expect(s.kind).toBe('matchEnd');
    if (s.kind !== 'matchEnd') throw new Error();
    expect(s.winnerId).toBe('a');
    expect(h.last('a').isLeader).toBe(true);
  });

  it('tied at ≥ target → another round', () => {
    const h = setup();
    h.startGame(['a', 'b']);
    expect(h.match.view().targetScore).toBe(15);
    // Simultaneous double KOs: +1 each per round, so both hit 15 together.
    for (let i = 0; i < 15; i++) {
      h.sim.queue(
        { type: 'eliminated', id: 'a', by: 'b', respawnMs: 5000, byGhost: false },
        { type: 'eliminated', id: 'b', by: 'a', respawnMs: 5000, byGhost: false },
      );
      h.step();
      expect(h.match.view().phase).toBe('results');
      h.match.hostAction('next');
      h.runMs(3000);
    }
    expect(h.score('a')).toBe(15);
    expect(h.score('b')).toBe(15);
    expect(h.match.view().phase).toBe('playing');
    expect(h.match.view().round).toBe(16);
    h.eliminate('b', 'a');
    expect(h.match.view().phase).toBe('matchEnd');
    expect(h.match.view().winnerId).toBe('a');
  });
});
