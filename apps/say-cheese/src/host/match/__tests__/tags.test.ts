// Tag validation (SPEC §6.4, §7.3, decisions #4, #14).
import { describe, expect, it } from 'vitest';
import type { PhoneMsg } from '../../../shared/messages';
import type { SeatId } from '../../../shared/seats';
import { applyTag } from '../tags';
import type { Player, Round } from '../types';
import { setup, started } from './harness';

/** In review of 2 photos, with the photographer's phone and the two dodgers. */
function inReview() {
  const h = started(3);
  h.shoot(2);
  const ph = h.photographer().id;
  const [x, y] = ['p1#0', 'p2#0', 'p3#0'].filter((id) => id !== ph) as SeatId[];
  const from = h.phPhone();
  const other = x.split('#')[0]!;
  const tag = (photo: number, tagId: string, playerId: SeatId | null, xy = 0.5) =>
    h.msg(from, { t: 'tag', photo, tagId, x: xy, y: xy, playerId });
  const tags = () => h.m.state.round!.tags;
  return { h, ph, x, y, from, other, tag, tags };
}

describe('tags', () => {
  it('are accepted only from the photographer’s phone', () => {
    const t = inReview();
    t.h.msg(t.other, { t: 'tag', photo: 0, tagId: 'a', x: 0.5, y: 0.5, playerId: t.y });
    expect(t.tags()).toEqual([]);
    t.tag(0, 'a', t.y);
    expect(t.tags()).toHaveLength(1);
  });

  it('need a photo that exists', () => {
    const t = inReview();
    t.tag(7, 'a', t.x);
    expect(t.tags()).toEqual([]);
  });

  it('need a current, non-spectator seat that isn’t the photographer', () => {
    const t = inReview();
    t.tag(0, 'a', t.ph);
    t.tag(0, 'b', 'zz#0');
    // A mid-match joiner spectates and can't be tagged.
    t.h.join('late', 'Late');
    t.tag(0, 'c', 'late#0');
    expect(t.tags()).toEqual([]);
    t.tag(0, 'd', null); // Unknown is fine, even twice
    t.tag(0, 'e', null);
    expect(t.tags()).toHaveLength(2);
  });

  it('one tag per player per photo: re-tagging changes it, a duplicate is rejected', () => {
    const t = inReview();
    t.tag(0, 'a', t.x);
    t.tag(0, 'b', t.x);
    expect(t.tags().map((g) => g.tagId)).toEqual(['a']);
    t.tag(1, 'b', t.x); // another photo is fine
    t.tag(0, 'a', t.y); // change a → y
    expect(t.tags().find((g) => g.tagId === 'a' && g.photo === 0)?.playerId).toBe(t.y);
    t.tag(0, 'b', t.x); // x is free on photo 0 again
    expect(t.tags()).toHaveLength(3);
  });

  it('untag removes', () => {
    const t = inReview();
    t.tag(0, 'a', t.x);
    t.h.msg(t.other, { t: 'untag', photo: 0, tagId: 'a' });
    expect(t.tags()).toHaveLength(1);
    t.h.msg(t.from, { t: 'untag', photo: 0, tagId: 'a' });
    expect(t.tags()).toEqual([]);
  });

  it('x, y are clamped to 0..1', () => {
    const round: Round = {
      r: 1,
      photographer: 'a#0',
      photos: [{ index: 0, aspect: 1, url: 'u' }],
      tags: [],
      shots: 1,
      shootDone: true,
      view: 0,
    };
    const players = [{ id: 'b#0', left: false, spectator: false }] as unknown as Player[];
    applyTag(round, players, { photo: 0, tagId: 'a', x: -0.3, y: 7, playerId: 'b#0' });
    expect(round.tags[0]).toMatchObject({ x: 0, y: 1 });
  });

  it('only count in review', () => {
    const h = started(3);
    const tag: PhoneMsg = { t: 'tag', photo: 0, tagId: 'a', x: 0.5, y: 0.5, playerId: null };
    h.msg(h.phPhone(), tag);
    h.shoot(1);
    h.msg(h.phPhone(), { t: 'finishReview' });
    h.msg(h.phPhone(), tag);
    expect(h.m.state.round!.tags).toEqual([]);
    expect(setup().m.state.round).toBeNull();
  });

  it('show live on the TV and in every review screen; view follows the photographer', () => {
    const t = inReview();
    t.tag(1, 'a', t.x);
    expect(t.h.m.tvView()).toMatchObject({ phase: 'review', photoIndex: 0, tags: [] });
    t.h.msg(t.other, { t: 'view', photo: 1 });
    expect(t.h.m.state.round!.view).toBe(0);
    t.h.msg(t.from, { t: 'view', photo: 1 });
    expect(t.h.m.tvView()).toMatchObject({
      phase: 'review',
      photoIndex: 1,
      photoCount: 2,
      tags: [{ tagId: 'a', player: { playerId: t.x } }],
      caught: [{ playerId: t.x, count: 1 }],
    });
    expect(t.h.m.screenFor(t.other)).toMatchObject({
      kind: 'review',
      role: 'dodger',
      photo: 1,
      tags: [{ tagId: 'a' }],
    });
    const mine = t.h.m.screenFor(t.from);
    expect(mine.kind === 'review' && mine.candidates.map((c) => c.playerId).sort()).toEqual(
      [t.x, t.y].sort(),
    );
  });
});
