// Autotile masks (N 1, E 2, S 4, W 8) and the shared-post rule (SPEC §2.5, §15.2; art README).
import { describe, expect, it } from 'vitest';
import {
  affectedBy,
  ALL_MASKS,
  E,
  maskAt,
  masksFor,
  N,
  postsDrawn,
  reachedEdges,
  S,
  W,
  wallShape,
} from '../autotile';

describe('autotile masks', () => {
  it('uses N = 1, E = 2, S = 4, W = 8 (N up-screen, E right)', () => {
    expect([N, E, S, W]).toEqual([1, 2, 4, 8]);
    const has = (c: number, r: number) => (c === 5 && r === 4) || (c === 6 && r === 5);
    expect(maskAt(has, 5, 5)).toBe(N | E); // m3: neighbors north and east
  });

  it('computes every case: isolated, ends, straights, corners, T-junctions, cross', () => {
    const m = masksFor([
      [0, 0], // isolated
      [10, 0],
      [11, 0],
      [12, 0], // across: end, middle, end
      [20, 0],
      [20, 1],
      [20, 2], // into
      [30, 0],
      [31, 0],
      [30, 1], // corner (E + S)
      [40, 1],
      [39, 1],
      [41, 1],
      [40, 2], // T (E + S + W)
      [50, 1],
      [50, 0],
      [51, 1],
      [50, 2],
      [49, 1], // cross
    ]);
    expect(m.get('0,0')).toBe(0);
    expect([m.get('10,0'), m.get('11,0'), m.get('12,0')]).toEqual([E, E | W, W]);
    expect([m.get('20,0'), m.get('20,1'), m.get('20,2')]).toEqual([S, N | S, N]);
    expect(m.get('30,0')).toBe(E | S);
    expect(m.get('40,1')).toBe(E | S | W);
    expect(m.get('50,1')).toBe(15);
  });

  it('recomputes a tile and its four neighbors on place/remove', () => {
    expect(affectedBy(3, 3)).toEqual([
      [3, 3],
      [3, 2],
      [4, 3],
      [3, 4],
      [2, 3],
    ]);
  });

  it('classifies straight walls: across, into, joint', () => {
    expect([0, 2, 8, 10].map(wallShape)).toEqual(['across', 'across', 'across', 'across']);
    expect([1, 4, 5].map(wallShape)).toEqual(['into', 'into', 'into']);
    expect([3, 6, 7, 9, 11, 12, 13, 14, 15].every((m) => wallShape(m) === 'joint')).toBe(true);
    expect(reachedEdges(0)).toEqual(['e', 'w']);
    expect(reachedEdges(13)).toEqual(['n', 's', 'w']);
  });

  it('draws every shared post exactly once (N/W always, E/S only without a neighbor)', () => {
    expect(postsDrawn(0)).toEqual({ edges: ['e', 'w'], center: false });
    expect(postsDrawn(E)).toEqual({ edges: ['w'], center: false }); // its east neighbor draws the shared post
    expect(postsDrawn(W)).toEqual({ edges: ['e', 'w'], center: false });
    expect(postsDrawn(S)).toEqual({ edges: ['n'], center: false });
    expect(postsDrawn(15)).toEqual({ edges: ['n', 'w'], center: true });
    // A row of three: posts at x = 0, 1, 2, 3 tile edges, each drawn once.
    const row = masksFor([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    const posts = [0, 1, 2].flatMap((c) =>
      postsDrawn(row.get(`${c},0`)!).edges.map((e) => (e === 'w' ? c : e === 'e' ? c + 1 : NaN)),
    );
    expect(posts.sort()).toEqual([0, 1, 2, 3]);
    expect(ALL_MASKS).toHaveLength(16);
  });
});
