// Phone wiring (SPEC §7.3, §7.4): hello on every open, uploads as shots are taken, acks, resends after
// a reconnect, and the local per-round photo store used by review.
import { describe, expect, it } from 'vitest';
import type { ConnectionStatus } from '@pcg/net-client';
import type { Screen } from '../../shared/messages';
import { createPhoneNet, type PhoneClientLike } from '../net';
import { createPhotoStore } from '../photos';

function fakeClient() {
  const msgs: ((d: unknown) => void)[] = [];
  const statuses: ((s: ConnectionStatus) => void)[] = [];
  const sent: { t: string; [k: string]: unknown }[] = [];
  const client: PhoneClientLike = {
    send: (d) => void sent.push(d as { t: string }),
    onMessage: (cb) => (msgs.push(cb), () => {}),
    onStatus: (cb) => (statuses.push(cb), () => {}),
  };
  return {
    client,
    sent,
    screen: (screen: Partial<Screen> & { kind: Screen['kind'] }) =>
      msgs.forEach((f) => f({ t: 'screen', screen: { seats: [], ...screen } })),
    status: (s: ConnectionStatus) => statuses.forEach((f) => f(s)),
  };
}

function store() {
  const revoked: string[] = [];
  let n = 0;
  const photos = createPhotoStore({
    createUrl: () => `blob:${++n}`,
    revokeUrl: (u) => void revoked.push(u),
  });
  return { photos, revoked };
}

const shot = (photo: number) => ({
  blob: new Blob([new Uint8Array([1, 2, photo])], { type: 'image/jpeg' }),
  width: 4,
  height: 3,
});
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('photo store', () => {
  it('keeps the latest round only', () => {
    const { photos, revoked } = store();
    photos.put(1, 0, new Blob(['a']));
    photos.put(1, 1, new Blob(['b']));
    expect(photos.url(1, 1)).toBe('blob:2');
    photos.put(2, 0, new Blob(['c']));
    expect(photos.url(1, 0)).toBeNull();
    expect(revoked).toEqual(['blob:1', 'blob:2']);
    expect(photos.url(2, 0)).toBe('blob:3');
  });
});

describe('phone net', () => {
  it('sends hello with seat 0 on every open', () => {
    const f = fakeClient();
    createPhoneNet({ client: f.client, playerKey: 'key', photos: store().photos });
    f.status('open');
    expect(f.sent.at(-1)).toEqual({ t: 'hello', seats: [] });
    f.screen({ kind: 'lobby', seats: [{ seat: 0, name: 'Ann', color: 'jade' }] });
    f.status('reconnecting');
    f.status('open');
    expect(f.sent.at(-1)).toEqual({
      t: 'hello',
      seats: [{ seat: 0, seatKey: 'key', name: 'Ann' }],
    });
  });

  it('uploads each shot, stops on ack, resends unacked after a reconnect', async () => {
    const f = fakeClient();
    const { photos } = store();
    const net = createPhoneNet({ client: f.client, playerKey: 'key', photos });
    f.status('open');
    f.screen({ kind: 'shoot', r: 7 } as Screen);
    net.onCapture(7, 0, shot(0));
    net.onCapture(7, 1, shot(1));
    await flush();
    const chunks = () => f.sent.filter((m) => m.t === 'chunk');
    expect(chunks().map((c) => c.photo)).toEqual([0, 1]);
    expect(photos.url(7, 1)).not.toBeNull();
    net.onHostMsg({ t: 'photoAck', r: 7, photo: 0 });
    f.status('reconnecting');
    f.status('open');
    expect(chunks().map((c) => c.photo)).toEqual([0, 1, 1]);
    expect(net.sender.pending()).toEqual([{ r: 7, photo: 1 }]);
  });

  it('forgets unsent photos once review starts, keeps the local copies', async () => {
    const f = fakeClient();
    const { photos } = store();
    const net = createPhoneNet({ client: f.client, playerKey: 'key', photos });
    f.screen({ kind: 'shoot', r: 3 } as Screen);
    net.onCapture(3, 0, shot(0));
    await flush();
    f.screen({ kind: 'review', r: 3 } as Screen);
    expect(net.sender.pending()).toEqual([]);
    expect(photos.url(3, 0)).not.toBeNull();
    f.screen({ kind: 'announce', r: 4 } as Screen);
    expect(photos.url(3, 0)).toBeNull();
  });
});
