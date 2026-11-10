// @vitest-environment jsdom
// Host wiring (SPEC §6.8, §7.4, §8): relay client ↔ match ↔ TV with a fake client and fake timers.
import type { HostRoom, PeerChange } from '@pcg/net-client';
import { describe, expect, it } from 'vitest';
import { bytesToBase64 } from '../../shared/blob-transfer';
import type { PhoneMsg } from '../../shared/messages';
import type { Sfx, SfxName } from '../../shared/sfx';
import { createHostGame } from '../game';
import { SCATTER_MS } from '../match/config';
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
    room: () => rooms.forEach((f) => f({ code: 'ABCD', reclaimed: false, roster: [] })),
  };
}

function setup() {
  const net = fakeClient();
  let t = 0;
  const due: { at: number; cb: () => void; id: number }[] = [];
  let nextId = 1;
  const timers = createHostTimers({
    now: () => t,
    setTimeout: (cb, ms) => {
      const id = nextId++;
      due.push({ at: t + ms, cb, id });
      return id;
    },
    clearTimeout: (h) => {
      const i = due.findIndex((d) => d.id === h);
      if (i >= 0) due.splice(i, 1);
    },
  });
  const advance = (ms: number) => {
    t += ms;
    for (const d of due.filter((x) => x.at <= t)) {
      due.splice(due.indexOf(d), 1);
      d.cb();
    }
  };
  const played: SfxName[] = [];
  const sfx: Sfx = {
    unlock: () => Promise.resolve(),
    play: (n) => void played.push(n),
    unlocked: true,
  };
  const revoked: string[] = [];
  let urls = 0;
  const stored = new Map<string, string>();
  const root = document.createElement('div');
  const game = createHostGame({
    client: net.client,
    root,
    origin: 'http://tv',
    timers,
    sfx,
    rng: () => 0,
    storage: { setItem: (k, v) => void stored.set(k, v) },
    createUrl: () => `blob:${++urls}`,
    revokeUrl: (u) => void revoked.push(u),
    setInterval: () => 0,
    clearInterval: () => {},
  });
  return { net, game, root, advance, played, revoked, stored };
}

/** Three phones in the lobby, cameras on, ready, started, rules skipped. */
function toAnnounce(h: ReturnType<typeof setup>) {
  h.net.room();
  for (const id of ['p1', 'p2', 'p3']) {
    h.net.peer(id);
    h.net.msg(id, { t: 'profile', seat: 0, name: id.toUpperCase() });
    h.net.msg(id, { t: 'camera', ok: true });
    h.net.msg(id, { t: 'ready', ready: true });
  }
  h.game.control({ action: 'start' });
  h.game.control({ action: 'skip' });
  expect(h.game.match.state.phase).toBe('announce');
  const s = h.game.match.state;
  const ph = s.players.find((p) => p.id === s.round!.photographer)!;
  return { from: ph.phoneId, r: s.round!.r };
}

const chunk = (r: number, photo: number) => ({
  t: 'chunk',
  r,
  photo,
  i: 0,
  n: 1,
  b64: bytesToBase64(new Uint8Array([0xff, 0xd8, photo])),
});

describe('host game wiring', () => {
  it('renders the lobby with the room code and sends each phone its screen', () => {
    const h = setup();
    h.net.room();
    h.net.peer('p1');
    expect(h.root.dataset.tv).toBe('lobby');
    expect(h.root.textContent).toContain('ABCD');
    expect(h.net.sent.some((s) => s.to === 'p1' && (s.data as { t: string }).t === 'screen')).toBe(
      true,
    );
    expect(h.stored.size).toBe(1);
  });

  it('drops junk messages', () => {
    const h = setup();
    h.net.room();
    h.net.peer('p1');
    h.net.msg('p1', { t: 'profile', seat: 0, name: 'x'.repeat(40) });
    h.net.msg('p1', { t: 'nope' });
    expect(h.game.match.state.players).toHaveLength(0);
  });

  it('runs a round: timers, photos with acks, review, results, sounds', () => {
    const h = setup();
    const { from, r } = toAnnounce(h);
    h.net.msg(from, { t: 'shootReady' });
    expect(h.game.match.state.phase).toBe('scatter');
    h.advance(SCATTER_MS);
    expect(h.game.match.state.phase).toBe('shoot');
    expect(h.played).toContain('startBuzz');

    for (let i = 0; i < 2; i++) {
      h.net.msg(from, { t: 'shot', r, photo: i, at: i, aspect: 0.75 });
      h.net.msg(from, chunk(r, i));
    }
    expect(h.played.filter((n) => n === 'shutter')).toHaveLength(2);
    const acks = h.net.sent.filter((s) => (s.data as { t: string }).t === 'photoAck');
    expect(acks.map((a) => [a.to, (a.data as { photo: number }).photo])).toEqual([
      [from, 0],
      [from, 1],
    ]);

    // A dodger's chunk for the same round is dropped before reassembly (SC6).
    const dodger = ['p1', 'p2', 'p3'].find((p) => p !== from)!;
    h.net.msg(dodger, chunk(r, 5));
    expect(h.revoked).toEqual([]);
    expect(h.game.match.state.round!.photos).toHaveLength(2);

    h.net.msg(from, { t: 'shootDone', r, count: 2 });
    expect(h.game.match.state.phase).toBe('review');
    expect(h.played).toContain('endBuzz');
    expect(h.played).toContain('develop');
    expect(h.root.querySelector('img.photo')?.getAttribute('src')).toBe('blob:1');

    const target = h.game.match.state.players.find((p) => p.phoneId === dodger)!.id;
    h.net.msg(from, { t: 'tag', photo: 0, tagId: 't1', x: 0.5, y: 0.5, playerId: target });
    expect(h.root.querySelectorAll('[data-tag]')).toHaveLength(1);
    h.net.msg(from, { t: 'finishReview' });
    expect(h.game.match.state.phase).toBe('results');
    expect(h.played).toContain('sting');
  });

  it('beeps every second of the 5 s scatter: beep at 5…2, beepFinal at 1 (SC5-fix-2)', () => {
    const h = setup();
    const { from } = toAnnounce(h);
    h.net.msg(from, { t: 'shootReady' });
    for (let i = 0; i < 20; i++) {
      h.advance(250);
      h.game.setVisible(true); // repaints like the ticker
    }
    expect(h.game.match.state.phase).toBe('shoot');
    const beeps = h.played.filter((n) => n === 'beep' || n === 'beepFinal');
    expect(beeps).toEqual(['beep', 'beep', 'beep', 'beep', 'beepFinal']);
  });

  it('a hidden tab pauses the scatter timer', () => {
    const h = setup();
    const { from } = toAnnounce(h);
    h.net.msg(from, { t: 'shootReady' });
    h.advance(SCATTER_MS / 2);
    h.game.setVisible(false);
    h.advance(60_000);
    expect(h.game.match.state.phase).toBe('scatter');
    h.game.setVisible(true);
    h.advance(SCATTER_MS / 2);
    expect(h.game.match.state.phase).toBe('shoot');
  });

  it('revokes photo URLs when the next round starts', () => {
    const h = setup();
    const { from, r } = toAnnounce(h);
    h.net.msg(from, { t: 'shootReady' });
    h.advance(SCATTER_MS);
    h.net.msg(from, { t: 'shot', r, photo: 0, at: 0, aspect: 1 });
    h.net.msg(from, chunk(r, 0));
    h.net.msg(from, { t: 'shootDone', r, count: 1 });
    h.net.msg(from, { t: 'finishReview' });
    h.game.control({ action: 'next' });
    expect(h.revoked).toContain('blob:1');
  });
});
