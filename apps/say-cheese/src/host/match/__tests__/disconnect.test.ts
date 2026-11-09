// Disconnect rules (SPEC §6.3 Disconnects, §6.5): sleeping dodgers stay in, a photographer gone before
// the shoot cancels and requeues the round, a photographer gone later leaves Skip review to the
// leader and the host, and leadership hands off without snapping back.
import { describe, expect, it } from 'vitest';
import type { SeatId } from '../../../shared/seats';
import { lobbyOf, started } from './harness';

const PHONES = ['p1', 'p2', 'p3', 'p4'];

/** A started match whose first photographer isn't the leader's phone (p1). */
function notLeaderShooting(n = 4) {
  for (let seed = 1; seed < 50; seed++) {
    const h = started(n, seed);
    if (h.phPhone() !== 'p1') return h;
  }
  throw new Error('no seed');
}

describe('disconnects', () => {
  it('a dodger who disconnects during the shoot is still taggable and keeps turn and score', () => {
    const h = notLeaderShooting();
    const ph = h.phPhone();
    const dodger = PHONES.find((p) => p !== ph && p !== 'p1')!;
    const id = `${dodger}#0` as SeatId;
    const r = h.m.state.round!.r;
    h.msg(ph, { t: 'shootReady' });
    h.timer('scatter');
    h.disconnect(dodger);
    expect(h.m.state.phase).toBe('shoot');
    h.msg(ph, { t: 'shot', r, photo: 0, at: 0, aspect: 1 });
    h.d({ type: 'photo', r, photo: 0, url: 'blob:0' });
    h.msg(ph, { t: 'shootDone', r, count: 1 });
    expect(h.m.state.phase).toBe('review');
    const rv = h.m.screenFor(ph);
    expect(rv.kind === 'review' && rv.candidates.map((c) => c.playerId)).toContain(id);
    h.msg(ph, { t: 'tag', photo: 0, tagId: 't', x: 0.5, y: 0.5, playerId: id });
    h.msg(ph, { t: 'finishReview' });
    const p = h.m.state.players.find((q) => q.id === id)!;
    expect(p.score).toBe(1);
    expect(p.connected).toBe(false);
    expect(h.m.state.queue).toContain(id);
  });

  it('photographer disconnect in announce cancels the round: no score, moved to the queue end', () => {
    const h = started(4);
    const ph = h.photographer().id;
    const turn = h.m.state.turn;
    const fx = h.disconnect(h.phPhone());
    expect(h.m.state.phase).toBe('announce');
    expect(h.photographer().id).not.toBe(ph);
    expect(h.m.state.turn).toBe(turn);
    expect(h.m.state.queue.at(-1)).toBe(ph);
    expect(h.m.state.lastResult).toBeNull();
    expect(h.m.state.players.every((p) => p.score === 0)).toBe(true);
    expect(fx.some((e) => e.type === 'screen')).toBe(true);
  });

  it('photographer disconnect in scatter cancels and requeues, clearing the timer', () => {
    const h = started(4);
    const ph = h.photographer().id;
    const r = h.m.state.round!.r;
    h.msg(h.phPhone(), { t: 'shootReady' });
    expect(h.m.state.phase).toBe('scatter');
    const fx = h.disconnect(h.phPhone());
    expect(fx).toContainEqual({ type: 'clearTimer', timer: 'scatter' });
    expect(h.m.state.phase).toBe('announce');
    expect(h.m.state.round!.r).toBeGreaterThan(r);
    expect(h.m.state.queue.at(-1)).toBe(ph);
    // The old scatter timer is stale now.
    h.timer('scatter');
    expect(h.m.state.phase).toBe('announce');
  });

  it('photographer disconnect on the pass screen cancels too', () => {
    const h = lobbyOf(3);
    h.msg('p3', { t: 'addSeat', name: 'Kid', seatKey: 'kid' });
    h.msg('p1', { t: 'leader', action: 'start' });
    h.msg('p1', { t: 'leader', action: 'skip' });
    while (h.m.state.phase !== 'pass') {
      h.playRound();
      h.ctl('next');
      if (h.m.state.phase === 'matchEnd') throw new Error('no pass round');
    }
    const ph = h.photographer().id;
    h.disconnect('p3');
    expect(h.m.state.phase).not.toBe('pass');
    expect(h.m.state.queue.at(-1)).toBe(ph);
  });

  it('a cancelled photographer still gone when the queue runs out is skipped', () => {
    const h = started(3);
    const gone = h.phPhone();
    const goneId = h.photographer().id;
    h.disconnect(gone);
    h.playRound();
    h.ctl('next');
    h.playRound();
    h.ctl('next');
    expect(h.m.state.phase).toBe('matchEnd');
    expect(h.m.state.players.find((p) => p.id === goneId)!.score).toBe(0);
  });

  it('a cancelled photographer who comes back takes their turn at the end', () => {
    const h = started(3);
    const gone = h.phPhone();
    const goneId = h.photographer().id;
    h.disconnect(gone);
    h.rejoin(gone);
    h.playRound();
    h.ctl('next');
    h.playRound();
    h.ctl('next');
    expect(h.photographer().id).toBe(goneId);
    expect(h.m.state.turn).toBe(3);
  });

  it('photographer disconnect during the shoot keeps the shoot going and the arrived photos', () => {
    const h = notLeaderShooting();
    const ph = h.phPhone();
    const r = h.m.state.round!.r;
    h.msg(ph, { t: 'shootReady' });
    h.timer('scatter');
    h.msg(ph, { t: 'shot', r, photo: 0, at: 0, aspect: 1 });
    h.msg(ph, { t: 'shot', r, photo: 1, at: 1, aspect: 1 });
    h.d({ type: 'photo', r, photo: 0, url: 'blob:0' });
    h.disconnect(ph);
    expect(h.m.state.phase).toBe('shoot');
    h.timer('shoot');
    expect(h.m.state.phase).toBe('upload');
    h.timer('upload');
    expect(h.m.state.phase).toBe('review');
    expect(h.m.state.round!.photos.map((p) => p.index)).toEqual([0]);
  });

  it('photographer reconnecting during upload gets a fresh upload grace', () => {
    const h = notLeaderShooting();
    const ph = h.phPhone();
    h.shoot(2, { arrive: 1, done: false });
    h.disconnect(ph);
    h.timer('shoot');
    expect(h.m.state.phase).toBe('upload');
    const fx = h.rejoin(ph);
    expect(fx.some((e) => e.type === 'startTimer' && e.timer === 'upload')).toBe(true);
  });

  it('photographer gone in review: Skip review for leader + host only, scoring the tags so far', () => {
    const h = notLeaderShooting();
    const ph = h.phPhone();
    const other = PHONES.find((p) => p !== ph && p !== 'p1')!;
    const target = `${other}#0` as SeatId;
    h.shoot(2);
    h.msg(ph, { t: 'tag', photo: 0, tagId: 'a', x: 0.2, y: 0.2, playerId: target });
    h.disconnect(ph);
    // Review waits: no timer, still review.
    expect(h.m.state.phase).toBe('review');
    expect(h.m.screenFor('p1')).toMatchObject({ kind: 'review', canSkipReview: true });
    expect(h.m.screenFor(other)).toMatchObject({ kind: 'review', canSkipReview: false });
    h.msg(other, { t: 'leader', action: 'skipReview' });
    expect(h.m.state.phase).toBe('review');
    h.ctl('skipReview');
    expect(h.m.state.phase).toBe('results');
    expect(h.m.state.players.find((p) => p.id === target)!.score).toBe(1);
    expect(h.photographer().score).toBe(-1);
  });

  it('photographer back in review: review continues from their phone, Skip review goes away', () => {
    const h = notLeaderShooting();
    const ph = h.phPhone();
    h.shoot(2);
    h.disconnect(ph);
    const fx = h.rejoin(ph);
    expect(fx.some((e) => e.type === 'screen' && e.to === ph && e.screen.kind === 'review')).toBe(
      true,
    );
    expect(h.m.screenFor('p1')).toMatchObject({ kind: 'review', canSkipReview: false });
    h.msg(ph, { t: 'finishReview' });
    expect(h.m.state.phase).toBe('results');
  });

  it('leader handoff when the leader disconnects mid-match, with no snap-back on return', () => {
    const h = notLeaderShooting();
    h.disconnect('p1');
    expect(h.m.state.leader).toBe('p2');
    expect(h.m.screenFor('p2').isLeader).toBe(true);
    h.rejoin('p1');
    expect(h.m.state.leader).toBe('p2');
    expect(h.m.screenFor('p1').isLeader).toBe(false);
  });
});
