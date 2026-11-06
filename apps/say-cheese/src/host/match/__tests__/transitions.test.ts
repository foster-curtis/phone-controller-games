// Phase graph (SPEC §6.2, §6.2.1, §6.3, §8): every edge, plus invalid events as no-ops per phase.
import { describe, expect, it } from 'vitest';
import type { PhoneMsg } from '../../../shared/messages';
import { RULES_CARDS, SCATTER_MS, SHOOT_MS, UPLOAD_GRACE_MS } from '../config';
import type { Effect, MatchEvent } from '../types';
import { lobbyOf, setup, started } from './harness';

const timers = (fx: Effect[]) =>
  fx.filter((e) => e.type === 'startTimer' || e.type === 'clearTimer');

/** Every leader action and photographer message that isn't valid in the phase under test. */
const junk: PhoneMsg[] = [
  { t: 'leader', action: 'start' },
  { t: 'leader', action: 'howToPlay' },
  { t: 'leader', action: 'next' },
  { t: 'leader', action: 'skip' },
  { t: 'leader', action: 'skipReview' },
  { t: 'leader', action: 'rematch' },
  { t: 'leader', action: 'lobby' },
  { t: 'shootReady' },
  { t: 'seatConfirm', seat: 0 },
  { t: 'shootDone', r: 99, count: 3 },
  { t: 'finishReview' },
  { t: 'emoji', i: 0 },
  { t: 'chunk', r: 1, photo: 0, i: 0, n: 1, b64: 'AA==' },
];

/** Sends each junk event (except `allowed`) and checks the phase never moves. */
function expectNoOps(h: ReturnType<typeof setup>, from: string, allowed: string[] = []) {
  const phase = h.m.state.phase;
  for (const j of junk) {
    const key = j.t === 'leader' ? `leader:${j.action}` : j.t;
    if (allowed.includes(key)) continue;
    h.msg(from, j);
    expect(h.m.state.phase, key).toBe(phase);
  }
  for (const t of ['scatter', 'shoot', 'upload'] as const) {
    if (t === phase) continue; // that phase's own timer is a real edge
    h.timer(t);
    expect(h.m.state.phase, `timer ${t}`).toBe(phase);
  }
}

describe('lobby', () => {
  it('Start needs the leader, ≥3 seats, every connected phone ready and a camera', () => {
    const h = lobbyOf(2);
    h.msg('p1', { t: 'leader', action: 'start' });
    expect(h.m.state.phase).toBe('lobby');
    h.join('p3', 'P3', { ready: false });
    h.msg('p1', { t: 'leader', action: 'start' });
    expect(h.m.state.phase).toBe('lobby');
    h.msg('p3', { t: 'ready', ready: true });
    h.msg('p2', { t: 'leader', action: 'start' }); // not the leader
    expect(h.m.state.phase).toBe('lobby');
    h.msg('p1', { t: 'leader', action: 'start' });
    expect(h.m.state.phase).toBe('rules');
  });

  it('a disconnected phone does not block Start; one camera is enough; none is not', () => {
    const h = setup();
    h.join('p1', 'A', { camera: false });
    h.join('p2', 'B', { camera: false });
    h.join('p3', 'C', { camera: false });
    h.join('p4', 'D', { ready: false });
    h.ctl('start');
    expect(h.m.state.phase).toBe('lobby');
    h.disconnect('p4');
    h.ctl('start');
    expect(h.m.state.phase).toBe('lobby'); // no camera among the connected phones
    h.msg('p3', { t: 'camera', ok: true });
    h.ctl('start'); // the host may start too
    expect(h.m.state.phase).toBe('rules');
  });

  it('How to play shows the rules and returns to the lobby, without marking them seen', () => {
    const h = lobbyOf(3);
    h.msg('p2', { t: 'leader', action: 'howToPlay' });
    expect(h.m.state.phase).toBe('lobby');
    h.msg('p1', { t: 'leader', action: 'howToPlay' });
    expect(h.m.state.phase).toBe('rules');
    for (let i = 0; i < RULES_CARDS; i++) h.msg('p1', { t: 'leader', action: 'next' });
    expect(h.m.state.phase).toBe('lobby');
    expect(h.m.state.rulesSeen).toBe(false);
    h.ctl('howToPlay');
    h.ctl('skip');
    expect(h.m.state.phase).toBe('lobby');
  });

  it('ignores round and leader events that do not apply', () => {
    const h = lobbyOf(3);
    expectNoOps(h, 'p1', ['leader:start', 'leader:howToPlay']);
  });
});

describe('rules', () => {
  it('shows on the first match only; Next walks the cards, the last one plays', () => {
    const h = lobbyOf(3);
    h.msg('p1', { t: 'leader', action: 'start' });
    expect(h.m.state.phase).toBe('rules');
    for (let i = 0; i < RULES_CARDS - 1; i++) {
      h.msg('p1', { t: 'leader', action: 'next' });
      expect(h.m.state.rulesCard).toBe(i + 1);
    }
    h.msg('p2', { t: 'leader', action: 'next' }); // not the leader
    expect(h.m.state.phase).toBe('rules');
    h.msg('p1', { t: 'leader', action: 'next' });
    expect(h.m.state.phase).toBe('announce');
    expect(h.m.state.rulesSeen).toBe(true);
  });

  it('Skip goes straight to the first round', () => {
    const h = lobbyOf(3);
    h.ctl('start');
    h.ctl('skip');
    expect(h.m.state.phase).toBe('announce');
    expect(h.m.state.turn).toBe(1);
  });

  it('ignores everything but Next / Skip', () => {
    const h = lobbyOf(3);
    h.ctl('start');
    expectNoOps(h, 'p1', ['leader:next', 'leader:skip']);
  });
});

describe('a round', () => {
  it('announce → scatter on I’m ready from the photographer’s phone only', () => {
    const h = started(3);
    const other = ['p1', 'p2', 'p3'].find((p) => p !== h.phPhone())!;
    h.msg(other, { t: 'shootReady' });
    expect(h.m.state.phase).toBe('announce');
    expectNoOps(h, h.phPhone(), ['shootReady']);
    const fx = h.msg(h.phPhone(), { t: 'shootReady' });
    expect(h.m.state.phase).toBe('scatter');
    expect(timers(fx)).toEqual([{ type: 'startTimer', timer: 'scatter', ms: SCATTER_MS }]);
  });

  it('scatter → shoot on the timer; countdowns come from the injected clock', () => {
    const h = started(3);
    h.msg(h.phPhone(), { t: 'shootReady' });
    expectNoOps(h, h.phPhone(), ['shootDone']);
    h.advance(4000);
    expect(h.m.tvView()).toMatchObject({ phase: 'scatter', endsInMs: SCATTER_MS - 4000 });
    const fx = h.timer('scatter');
    expect(h.m.state.phase).toBe('shoot');
    expect(timers(fx)).toEqual([{ type: 'startTimer', timer: 'shoot', ms: SHOOT_MS }]);
    expect(h.m.screenFor(h.phPhone())).toMatchObject({ kind: 'shoot', endsInMs: SHOOT_MS });
  });

  const toShoot = () => {
    const h = started(3);
    h.msg(h.phPhone(), { t: 'shootReady' });
    h.timer('scatter');
    return h;
  };

  it('shoot ends at SHOOT_MS', () => {
    const h = toShoot();
    const fx = h.timer('shoot');
    expect(h.m.state.phase).toBe('upload');
    expect(timers(fx)).toEqual([{ type: 'startTimer', timer: 'upload', ms: UPLOAD_GRACE_MS }]);
  });

  it('shoot ends at the 15th shot', () => {
    const h = toShoot();
    const r = h.m.state.round!.r;
    for (let i = 0; i < 14; i++) h.msg(h.phPhone(), { t: 'shot', r, photo: i, at: 0, aspect: 1 });
    expect(h.m.state.phase).toBe('shoot');
    const fx = h.msg(h.phPhone(), { t: 'shot', r, photo: 14, at: 0, aspect: 1 });
    expect(h.m.state.phase).toBe('upload');
    expect(timers(fx)[0]).toEqual({ type: 'clearTimer', timer: 'shoot' });
  });

  it('shoot ends on shootDone; a stale round id or another phone is ignored', () => {
    const h = toShoot();
    const r = h.m.state.round!.r;
    h.msg(h.phPhone(), { t: 'shootDone', r: r + 1, count: 2 });
    const other = ['p1', 'p2', 'p3'].find((p) => p !== h.phPhone())!;
    h.msg(other, { t: 'shootDone', r, count: 2 });
    expect(h.m.state.phase).toBe('shoot');
    h.msg(h.phPhone(), { t: 'shootDone', r, count: 2 });
    expect(h.m.state.phase).toBe('upload');
  });

  it('upload ends when all `count` photos arrived', () => {
    const h = toShoot();
    const r = h.m.state.round!.r;
    for (let i = 0; i < 3; i++) h.msg(h.phPhone(), { t: 'shot', r, photo: i, at: 0, aspect: 1 });
    h.d({ type: 'photo', r, photo: 0, url: 'u0' });
    h.msg(h.phPhone(), { t: 'shootDone', r, count: 3 });
    expect(h.m.tvView()).toMatchObject({ phase: 'upload', received: 1, expected: 3 });
    h.d({ type: 'photo', r, photo: 1, url: 'u1' });
    expect(h.m.state.phase).toBe('upload');
    const fx = h.d({ type: 'photo', r, photo: 2, url: 'u2' });
    expect(h.m.state.phase).toBe('review');
    expect(timers(fx)).toEqual([{ type: 'clearTimer', timer: 'upload' }]);
  });

  it('upload goes straight to review when everything arrived during the shoot', () => {
    const h = started(3);
    h.shoot(2);
    expect(h.m.state.phase).toBe('review');
  });

  it('upload moves on after UPLOAD_GRACE_MS with whatever arrived', () => {
    const h = started(3);
    h.shoot(4, { arrive: 2 });
    expect(h.m.state.phase).toBe('upload');
    h.timer('upload');
    expect(h.m.state.phase).toBe('review');
    expect(h.m.state.round!.photos.map((p) => p.index)).toEqual([0, 1]);
  });

  it('0 photos → results with no score', () => {
    const h = started(3);
    h.shoot(3, { arrive: 0 });
    h.timer('upload');
    expect(h.m.state.phase).toBe('results');
    expect(h.m.state.lastResult).toMatchObject({ caught: [], photographerDelta: 0 });
    expect(h.m.state.players.every((p) => p.score === 0)).toBe(true);
  });

  it('a stale or late photo is released, not kept', () => {
    const h = started(3);
    const r = h.m.state.round!.r;
    expect(h.d({ type: 'photo', r, photo: 0, url: 'early' })).toContainEqual({
      type: 'releasePhotos',
      urls: ['early'],
    });
    h.shoot(1);
    expect(h.d({ type: 'photo', r: r + 5, photo: 0, url: 'stale' })).toContainEqual({
      type: 'releasePhotos',
      urls: ['stale'],
    });
  });

  it('review → results only on finishReview from the photographer’s phone', () => {
    const h = started(3);
    h.shoot(1);
    const other = ['p1', 'p2', 'p3'].find((p) => p !== h.phPhone())!;
    h.msg(other, { t: 'finishReview' });
    expectNoOps(h, h.m.state.leader!, ['finishReview']);
    expect(h.m.state.phase).toBe('review');
    h.msg(h.phPhone(), { t: 'finishReview' });
    expect(h.m.state.phase).toBe('results');
  });

  it('leader / host Skip review only while the photographer is disconnected', () => {
    const h = started(4);
    if (h.phPhone() === 'p1') {
      h.playRound();
      h.ctl('next');
    }
    h.shoot(1);
    h.ctl('skipReview');
    expect(h.m.state.phase).toBe('review');
    expect(h.m.screenFor('p1')).toMatchObject({ kind: 'review', canSkipReview: false });
    const ph = h.phPhone();
    h.disconnect(ph);
    expect(h.m.screenFor('p1')).toMatchObject({ kind: 'review', canSkipReview: true });
    expect(h.m.tvView()).toMatchObject({ phase: 'review', canSkipReview: true });
    h.msg('p1', { t: 'leader', action: 'skipReview' });
    expect(h.m.state.phase).toBe('results');
  });

  it('results → the next photographer, then match end after the last', () => {
    const h = started(3);
    const seen = new Set<string>();
    for (let turn = 1; turn <= 3; turn++) {
      expect(h.m.state.turn).toBe(turn);
      seen.add(h.photographer().id);
      h.playRound();
      expect(h.m.state.phase).toBe('results');
      expectNoOps(h, 'p1', ['leader:next']);
      expect(h.m.tvView()).toMatchObject({ phase: 'results', last: turn === 3 });
      h.msg('p1', { t: 'leader', action: 'next' });
    }
    expect(seen.size).toBe(3);
    expect(h.m.state.phase).toBe('matchEnd');
  });
});

describe('match end', () => {
  const ended = () => {
    const h = started(3);
    h.playRound([['p1#0', 'p2#0', 'p3#0']]);
    h.ctl('next');
    h.playRound();
    h.ctl('next');
    h.playRound();
    h.ctl('next');
    return h;
  };

  it('ignores everything but Rematch / Back to lobby', () => {
    const h = ended();
    expect(h.m.state.phase).toBe('matchEnd');
    expectNoOps(h, 'p1', ['leader:rematch', 'leader:lobby']);
  });

  it('Rematch skips the rules, reshuffles and resets the scores', () => {
    const h = ended();
    expect(h.m.state.players.some((p) => p.score !== 0)).toBe(true);
    const first = h.m.state.matchNo;
    h.msg('p1', { t: 'leader', action: 'rematch' });
    expect(h.m.state.phase).toBe('announce');
    expect(h.m.state.matchNo).toBe(first + 1);
    expect(h.m.state.turn).toBe(1);
    expect(h.m.state.queue).toHaveLength(2);
    expect(h.m.state.players.every((p) => p.score === 0)).toBe(true);
  });

  it('Rematch shuffles again (different orders across seeds and matches)', () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 6; seed++) {
      const h = started(5, seed);
      orders.add([h.photographer().id, ...h.m.state.queue].join());
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('Back to lobby', () => {
    const h = ended();
    const fx = h.msg('p1', { t: 'leader', action: 'lobby' });
    expect(h.m.state.phase).toBe('lobby');
    expect(h.m.state.round).toBeNull();
    expect(fx.some((e) => e.type === 'screen' && e.screen.kind === 'lobby')).toBe(true);
    h.ctl('start');
    expect(h.m.state.phase).toBe('announce'); // rules already seen
  });
});

describe('pass screen', () => {
  it('shows only for a photographer whose phone has ≥2 seats; the right seatConfirm advances', () => {
    const h = setup();
    h.join('a', 'Ana');
    h.msg('a', { t: 'addSeat', name: 'Leo', seatKey: 'kLeo' });
    h.join('b', 'Bo', { camera: false });
    h.ctl('start');
    h.ctl('skip');
    // Only phone a has a camera: both its seats photograph, each after a pass screen.
    for (let turn = 0; turn < 2; turn++) {
      expect(h.m.state.phase).toBe('pass');
      const ph = h.photographer();
      expect(h.m.screenFor('a')).toMatchObject({ kind: 'pass', seat: ph.seat, name: ph.name });
      expect(h.m.screenFor('b')).toMatchObject({ kind: 'announce', role: 'dodger' });
      expect(h.m.tvView()).toMatchObject({ phase: 'pass', photographer: { name: ph.name } });
      h.msg('b', { t: 'seatConfirm', seat: ph.seat });
      h.msg('a', { t: 'seatConfirm', seat: 1 - ph.seat });
      expect(h.m.state.phase).toBe('pass');
      h.msg('a', { t: 'seatConfirm', seat: ph.seat });
      expect(h.m.state.phase).toBe('announce');
      h.playRound();
      h.ctl('next');
    }
    expect(h.m.state.phase).toBe('matchEnd');
  });

  it('single-seat phones go straight to announce', () => {
    const h = started(3);
    expect(h.m.state.phase).toBe('announce');
  });
});

describe('effects', () => {
  it('sends each connected phone its screen only when it changed, and persists changes', () => {
    const h = lobbyOf(3);
    const fx = h.msg('p2', { t: 'ready', ready: true }); // already ready: nothing changes
    expect(fx).toEqual([]);
    const fx2 = h.ctl('start');
    const to = fx2.filter((e) => e.type === 'screen').map((e) => (e as { to: string }).to);
    expect(to.sort()).toEqual(['p1', 'p2', 'p3']);
    expect(fx2.some((e) => e.type === 'persist')).toBe(true);
  });

  it('a reconnecting phone gets its screen again', () => {
    const h = lobbyOf(3);
    h.disconnect('p3');
    const fx = h.rejoin('p3');
    expect(fx).toContainEqual(expect.objectContaining({ type: 'screen', to: 'p3' }));
  });

  it('a room event sets the code for the TV lobby', () => {
    const h = setup();
    const ev: MatchEvent = { type: 'room', code: 'ABCD' };
    h.d(ev);
    expect(h.m.tvView()).toMatchObject({ phase: 'lobby', code: 'ABCD' });
  });

  it('photos are released when the next round starts', () => {
    const h = started(3);
    h.playRound([[]], 2);
    const fx = h.ctl('next');
    const rel = fx.find((e) => e.type === 'releasePhotos');
    expect(rel).toMatchObject({ urls: [expect.stringMatching(/^blob:/), expect.any(String)] });
  });
});
