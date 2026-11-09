// @vitest-environment jsdom
// Host wiring robustness (SPEC §6.3, §7.4): restore from the sessionStorage snapshot on a reclaimed
// room (fresh match on a new one), phones missing from the reclaim roster count as gone, and chunks
// of a stale round or a finished upload never reach the receiver.
import type { HostRoom, PeerChange, RosterEntry } from '@pcg/net-client';
import { describe, expect, it } from 'vitest';
import { bytesToBase64 } from '../../shared/blob-transfer';
import type { PhoneMsg } from '../../shared/messages';
import { createHostGame } from '../game';
import { PERSIST_KEY } from '../match/config';
import type { HostClientLike } from '../net';
import { createHostTimers } from '../timers';

function fakeClient() {
  const msgs: ((from: string, data: unknown) => void)[] = [];
  const peers: ((c: PeerChange) => void)[] = [];
  const rooms: ((r: HostRoom) => void)[] = [];
  const sent: { to: string | undefined; data: unknown }[] = [];
  const client: HostClientLike = {
    code: 'ABCD',
    send: (data, to) => void sent.push({ data, to }),
    kick: () => {},
    onMessage: (cb) => (msgs.push(cb), () => {}),
    onPeer: (cb) => (peers.push(cb), () => {}),
    onRoom: (cb) => (rooms.push(cb), () => {}),
    onStatus: () => () => {},
  };
  return {
    client,
    sent,
    msg: (from: string, data: PhoneMsg | Record<string, unknown>) =>
      msgs.forEach((f) => f(from, data)),
    peer: (playerId: string) =>
      peers.forEach((f) => f({ event: 'joined', playerId, playerKey: `k-${playerId}` })),
    room: (reclaimed = false, roster: RosterEntry[] = []) =>
      rooms.forEach((f) => f({ code: 'ABCD', reclaimed, roster })),
  };
}

function setup(stored = new Map<string, string>()) {
  const net = fakeClient();
  let t = 0;
  const timers = createHostTimers({
    now: () => t,
    setTimeout: () => 0,
    clearTimeout: () => {},
  });
  let urls = 0;
  const revoked: string[] = [];
  const game = createHostGame({
    client: net.client,
    root: document.createElement('div'),
    origin: 'http://tv',
    timers,
    rng: () => 0,
    storage: {
      setItem: (k, v) => void stored.set(k, v),
      getItem: (k) => stored.get(k) ?? null,
    },
    createUrl: () => `blob:${++urls}`,
    revokeUrl: (u) => void revoked.push(u),
    setInterval: () => 0,
    clearInterval: () => {},
  });
  return { net, game, stored, revoked, tick: (ms: number) => (t += ms) };
}

function toShoot(h: ReturnType<typeof setup>) {
  h.net.room();
  for (const id of ['p1', 'p2', 'p3']) {
    h.net.peer(id);
    h.net.msg(id, { t: 'profile', seat: 0, name: id.toUpperCase() });
    h.net.msg(id, { t: 'camera', ok: true });
    h.net.msg(id, { t: 'ready', ready: true });
  }
  h.game.control({ action: 'start' });
  h.game.control({ action: 'skip' });
  const s = h.game.match.state;
  const ph = s.players.find((p) => p.id === s.round!.photographer)!;
  h.net.msg(ph.phoneId, { t: 'shootReady' });
  h.game.dispatch({ type: 'timer', timer: 'scatter' });
  expect(s.phase).toBe('shoot');
  return { from: ph.phoneId, r: s.round!.r, ph: ph.id };
}

const chunk = (r: number, photo: number) => ({
  t: 'chunk',
  r,
  photo,
  i: 0,
  n: 1,
  b64: bytesToBase64(new Uint8Array([0xff, 0xd8, photo])),
});
const acks = (h: ReturnType<typeof setup>) =>
  h.net.sent.filter((s) => (s.data as { t: string }).t === 'photoAck');

const roster = (ids: string[]): RosterEntry[] =>
  ids.map((id) => ({ playerId: id, playerKey: `k-${id}`, connected: true }));

describe('host wiring: refresh and stale chunks', () => {
  it('a reload on a reclaimed room restores the match and replays the round', () => {
    const a = setup();
    const { ph, r } = toShoot(a);
    const scores = a.game.match.state.players.map((p) => [p.id, p.score]);
    expect(a.stored.get(PERSIST_KEY)).toBeTruthy();

    const b = setup(a.stored);
    b.net.room(true, roster(['p1', 'p2', 'p3']));
    const s = b.game.match.state;
    expect(s.phase).toBe('announce');
    expect(s.round!.photographer).toBe(ph);
    expect(s.round!.r).toBeGreaterThan(r);
    expect(s.players.map((p) => [p.id, p.score])).toEqual(scores);
    // Every phone in the roster gets its screen.
    for (const id of ['p1', 'p2', 'p3']) {
      expect(b.net.sent.some((m) => m.to === id && (m.data as { t: string }).t === 'screen')).toBe(
        true,
      );
    }
  });

  it('a phone missing from the reclaim roster is gone (a replayed photographer is requeued)', () => {
    const a = setup();
    const { ph, from } = toShoot(a);
    const b = setup(a.stored);
    b.net.room(true, roster(['p1', 'p2', 'p3'].filter((id) => id !== from)));
    const s = b.game.match.state;
    expect(s.round!.photographer).not.toBe(ph);
    expect(s.queue.at(-1)).toBe(ph);
    expect(s.players.find((p) => p.id === ph)!.connected).toBe(false);
  });

  it('a new room (reclaim refused) drops the snapshot and starts in an empty lobby', () => {
    const a = setup();
    toShoot(a);
    const b = setup(a.stored);
    b.net.room(false);
    expect(b.game.match.state.phase).toBe('lobby');
    expect(b.game.match.state.players).toEqual([]);
  });

  it('chunks of a stale round, from another phone or after the upload are dropped', () => {
    const h = setup();
    const { from, r } = toShoot(h);
    const other = ['p1', 'p2', 'p3'].find((id) => id !== from)!;
    h.net.msg(from, chunk(r - 1, 0));
    h.net.msg(other, chunk(r, 0));
    expect(acks(h)).toHaveLength(0);
    h.net.msg(from, chunk(r, 0));
    expect(acks(h)).toHaveLength(1);
    h.net.msg(from, { t: 'shootDone', r, count: 2 });
    expect(h.game.match.state.phase).toBe('upload');
    h.game.dispatch({ type: 'timer', timer: 'upload' });
    expect(h.game.match.state.phase).toBe('review');
    h.net.msg(from, chunk(r, 1));
    expect(acks(h)).toHaveLength(1);
    expect(h.game.match.state.round!.photos.map((p) => p.index)).toEqual([0]);
  });
});
