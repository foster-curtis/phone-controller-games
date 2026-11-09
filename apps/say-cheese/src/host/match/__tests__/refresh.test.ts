// Host refresh (SPEC §6.3): the sessionStorage snapshot restores roster, scores, queue and round
// number; a round in progress is replayed with the same photographer under a new round id.
import { describe, expect, it } from 'vitest';
import { parsePersisted, serialize } from '../persist';
import { setup, started } from './harness';

/** The snapshot as it would come back from sessionStorage. */
const reload = (h: ReturnType<typeof started>) =>
  setup({ restored: parsePersisted(JSON.stringify(serialize(h.m.state)))! });

describe('host refresh', () => {
  it('persisted state → restore → the round in review is replayed with a new r', () => {
    const h = started(4);
    h.playRound();
    h.ctl('next');
    const ph = h.photographer().id;
    const r = h.m.state.round!.r;
    const turn = h.m.state.turn;
    const scores = h.m.state.players.map((p) => p.score);
    h.shoot(3);
    expect(h.m.state.phase).toBe('review');
    const back = reload(h);
    expect(back.m.state.phase).toBe('announce');
    expect(back.photographer().id).toBe(ph);
    expect(back.m.state.round!.r).toBeGreaterThan(r);
    expect(back.m.state.round!.photos).toEqual([]);
    expect(back.m.state.turn).toBe(turn);
    expect(back.m.state.players.map((p) => p.score)).toEqual(scores);
    expect(back.m.state.queue).toEqual(h.m.state.queue);
  });

  it('the old round id is stale after the replay', () => {
    const h = started(3);
    const old = h.m.state.round!.r;
    const back = reload(h);
    const fx = back.d({ type: 'photo', r: old, photo: 0, url: 'blob:stale' });
    expect(fx).toContainEqual({ type: 'releasePhotos', urls: ['blob:stale'] });
    back.msg(back.phPhone(), { t: 'shootReady' });
    back.timer('scatter');
    back.msg(back.phPhone(), { t: 'shot', r: old, photo: 0, at: 0, aspect: 1 });
    expect(back.m.state.round!.shots).toBe(0);
  });

  it('a replayed photographer missing from the reclaimed room is requeued', () => {
    const h = started(4);
    const ph = h.photographer().id;
    const back = reload(h);
    back.disconnect(back.phPhone());
    expect(back.photographer().id).not.toBe(ph);
    expect(back.m.state.queue.at(-1)).toBe(ph);
  });

  it('results restore to the next turn; the lobby and match end come back as they were', () => {
    const h = started(3);
    h.playRound();
    const turn = h.m.state.turn;
    const back = reload(h);
    expect(back.m.state.phase).toBe('announce');
    expect(back.m.state.turn).toBe(turn + 1);
    h.ctl('next');
    h.playRound();
    h.ctl('next');
    h.playRound();
    h.ctl('next');
    expect(h.m.state.phase).toBe('matchEnd');
    expect(reload(h).m.state.phase).toBe('matchEnd');
  });
});
