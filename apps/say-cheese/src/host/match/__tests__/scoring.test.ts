// Scoring (SPEC §6.1, decision #6): per-photo catches, the photographer's −1s, lowest wins, ties share.
import { describe, expect, it } from 'vitest';
import type { SeatId } from '../../../shared/seats';
import { scoreRound, standings, winners } from '../scoring';
import type { Player, Tag } from '../types';
import { started } from './harness';

const tag = (photo: number, playerId: SeatId | null, n = 0): Tag => ({
  tagId: `t${photo}-${n}`,
  photo,
  x: 0.5,
  y: 0.5,
  playerId,
});

const player = (id: SeatId, score: number, joinIndex: number, o: Partial<Player> = {}): Player => ({
  id,
  phoneId: id.split('#')[0]!,
  seat: 0,
  playerKey: id,
  name: id,
  color: 'crimson',
  score,
  connected: true,
  camera: 'ok',
  ready: true,
  joinIndex,
  spectator: false,
  left: false,
  ...o,
});

describe('scoreRound', () => {
  it('+1 per tagged photo per player, −1 per tag to the photographer', () => {
    const r = scoreRound(1, 'a#0', [tag(0, 'b#0'), tag(0, 'c#0', 1), tag(1, 'b#0')]);
    expect(r.caught).toEqual([
      { playerId: 'b#0', count: 2 },
      { playerId: 'c#0', count: 1 },
    ]);
    expect(r.photographerDelta).toBe(-3);
  });

  it('Unknown scores nothing for anyone', () => {
    const r = scoreRound(1, 'a#0', [tag(0, null), tag(0, null, 1), tag(1, 'b#0')]);
    expect(r.caught).toEqual([{ playerId: 'b#0', count: 1 }]);
    expect(r.photographerDelta).toBe(-1);
  });

  it('a player tagged in 4 photos gets +4', () => {
    const r = scoreRound(
      1,
      'a#0',
      [0, 1, 2, 3].map((p) => tag(p, 'b#0')),
    );
    expect(r.caught).toEqual([{ playerId: 'b#0', count: 4 }]);
  });
});

describe('standings and winners', () => {
  it('sort lowest first (join order on ties); left seats and spectators are not listed', () => {
    const ps = [
      player('a#0', 3, 0),
      player('b#0', -2, 1),
      player('c#0', 3, 2),
      player('d#0', -5, 3, { left: true }),
      player('e#0', 0, 4, { spectator: true }),
    ];
    expect(standings(ps).map((s) => s.playerId)).toEqual(['b#0', 'a#0', 'c#0']);
  });

  it('every seat tied on the lowest score wins', () => {
    const ps = [player('a#0', 1, 0), player('b#0', 1, 1), player('c#0', 4, 2)];
    expect(winners(ps)).toEqual(['a#0', 'b#0']);
    expect(winners([player('a#0', 2, 0)])).toEqual(['a#0']);
  });
});

describe('in a match', () => {
  it('finishReview applies the final tags to the scores', () => {
    const h = started(3);
    const ph = h.photographer().id;
    const [x, y] = ['p1#0', 'p2#0', 'p3#0'].filter((id) => id !== ph) as SeatId[];
    h.playRound([[x, y], [x], [null]]);
    const score = (id: string) => h.m.state.players.find((p) => p.id === id)!.score;
    expect(score(x)).toBe(2);
    expect(score(y)).toBe(1);
    expect(score(ph)).toBe(-3);
    expect(h.m.tvView()).toMatchObject({
      phase: 'results',
      photographerDelta: -3,
      caught: [
        { playerId: x, count: 2 },
        { playerId: y, count: 1 },
      ],
    });
    const st = h.m.screenFor('p1');
    expect(st.kind === 'results' && st.standings.map((s) => s.playerId)).toEqual([ph, y, x]);
  });
});
