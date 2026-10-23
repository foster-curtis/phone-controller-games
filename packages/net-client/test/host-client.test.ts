import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHostClient, RelayError } from '../src/api';
import type { ConnectionStatus, HostRoom, PeerChange } from '../src/api';
import { hostTokenStorageKey } from '../src/host-client';
import { fakeDocument, fakeWebSocket, MemoryStorage } from './fakes';

const GAME = 'sunny-side';

function setup(session = new MemoryStorage()) {
  const ws = fakeWebSocket();
  const { doc, setVisibility } = fakeDocument('visible');
  const host = createHostClient({
    url: 'ws://relay.test',
    game: GAME,
    maxPlayers: 8,
    WebSocket: ws.WebSocket,
    sessionStorage: session,
    localStorage: new MemoryStorage(),
    document: doc,
  });
  const statuses: ConnectionStatus[] = [];
  host.onStatus((s) => statuses.push(s));
  return { host, ws, session, statuses, setVisibility };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(1);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('HostClient', () => {
  it('create: sends create, stores hostToken in the injected storage, resolves the room', async () => {
    const { host, ws, session, statuses } = setup();
    const started = host.start();
    expect(host.status).toBe('connecting');
    const sock = ws.sockets[0]!;
    expect(sock.url).toBe('ws://relay.test');
    sock.open();
    expect(sock.messages).toEqual([{ t: 'create', game: GAME, maxPlayers: 8 }]);
    sock.receive({ t: 'created', code: 'ABCD', hostToken: 'secret' });
    await expect(started).resolves.toEqual({ code: 'ABCD', reclaimed: false, roster: [] });
    expect(session.getItem(hostTokenStorageKey(GAME))).toBe('secret');
    expect(host.code).toBe('ABCD');
    expect(host.status).toBe('open');
    expect(statuses).toEqual(['connecting', 'open']);
  });

  it('start() reclaims when a host token is stored (page refresh)', async () => {
    const session = new MemoryStorage();
    session.setItem(hostTokenStorageKey(GAME), 'secret');
    const { host, ws } = setup(session);
    const started = host.start();
    const sock = ws.sockets[0]!;
    sock.open();
    expect(sock.messages).toEqual([{ t: 'reclaim', hostToken: 'secret' }]);
    const roster = [{ playerId: 'p1', playerKey: 'k1', connected: true }];
    sock.receive({ t: 'reclaimed', code: 'ABCD', roster });
    await expect(started).resolves.toEqual({ code: 'ABCD', reclaimed: true, roster });
  });

  it('a stale stored token (no-room) falls back to creating a new room', async () => {
    const session = new MemoryStorage();
    session.setItem(hostTokenStorageKey(GAME), 'stale');
    const { host, ws } = setup(session);
    const errors: RelayError[] = [];
    host.onError((e) => errors.push(e));
    const started = host.start();
    const sock = ws.sockets[0]!;
    sock.open();
    sock.receive({ t: 'error', code: 'no-room' });
    expect(session.getItem(hostTokenStorageKey(GAME))).toBeNull();
    expect(sock.last).toEqual({ t: 'create', game: GAME, maxPlayers: 8 });
    sock.receive({ t: 'created', code: 'WXYZ', hostToken: 'fresh' });
    await expect(started).resolves.toMatchObject({ code: 'WXYZ', reclaimed: false });
    expect(errors).toEqual([]);
  });

  it('on reconnect after a drop, sends reclaim and emits the roster', async () => {
    const { host, ws, statuses } = setup();
    const rooms: HostRoom[] = [];
    host.onRoom((r) => rooms.push(r));
    const started = host.start();
    ws.sockets[0]!.open();
    ws.sockets[0]!.receive({ t: 'created', code: 'ABCD', hostToken: 'secret' });
    await started;

    ws.sockets[0]!.drop();
    expect(host.status).toBe('reconnecting');
    vi.advanceTimersByTime(250);
    expect(ws.sockets).toHaveLength(2);
    const sock = ws.sockets[1]!;
    sock.open();
    expect(sock.messages).toEqual([{ t: 'reclaim', hostToken: 'secret' }]);
    const roster = [
      { playerId: 'p1', playerKey: 'k1', connected: true },
      { playerId: 'p2', playerKey: 'k2', connected: false },
    ];
    sock.receive({ t: 'reclaimed', code: 'ABCD', roster });
    expect(rooms.at(-1)).toEqual({ code: 'ABCD', reclaimed: true, roster });
    expect(host.status).toBe('open');
    expect(statuses).toEqual(['connecting', 'open', 'reconnecting', 'open']);
  });

  it('routes messages, peers, send / lock / unlock / kick', async () => {
    const { host, ws } = setup();
    const started = host.start();
    const sock = ws.sockets[0]!;
    sock.open();
    sock.receive({ t: 'created', code: 'ABCD', hostToken: 'secret' });
    await started;

    const got: [string, unknown][] = [];
    const peers: PeerChange[] = [];
    const off = host.onMessage((from, data) => got.push([from, data]));
    host.onPeer((p) => peers.push(p));
    sock.receive({ t: 'peer', event: 'joined', playerId: 'p1', playerKey: 'k1' });
    sock.receive({ t: 'msg', from: 'p1', data: [10, 0, 1, 1, 0] });
    off();
    sock.receive({ t: 'msg', from: 'p1', data: 'ignored' });
    expect(peers).toEqual([{ event: 'joined', playerId: 'p1', playerKey: 'k1' }]);
    expect(got).toEqual([['p1', [10, 0, 1, 1, 0]]]);

    host.send({ hi: 1 });
    host.send({ hi: 2 }, 'p1');
    host.lock();
    host.unlock();
    host.kick('p1');
    expect(sock.messages.slice(1)).toEqual([
      { t: 'send', data: { hi: 1 } },
      { t: 'send', to: 'p1', data: { hi: 2 } },
      { t: 'lock' },
      { t: 'unlock' },
      { t: 'kick', playerId: 'p1' },
    ]);
  });

  it('a handshake error rejects start() with a RelayError and stops', async () => {
    const { host, ws } = setup();
    const started = host.start();
    ws.sockets[0]!.open();
    ws.sockets[0]!.receive({ t: 'error', code: 'bad-request' });
    await expect(started).rejects.toBeInstanceOf(RelayError);
    await expect(started).rejects.toMatchObject({ code: 'bad-request' });
    expect(host.status).toBe('closed');
    expect(host.closeReason).toBe('bad-request');
    vi.advanceTimersByTime(10_000);
    expect(ws.sockets).toHaveLength(1);
  });

  it('close() is final: no reconnect, socket closed, token kept for reload', async () => {
    const { host, ws, session } = setup();
    const started = host.start();
    ws.sockets[0]!.open();
    ws.sockets[0]!.receive({ t: 'created', code: 'ABCD', hostToken: 'secret' });
    await started;
    host.close();
    expect(ws.sockets[0]!.closedByClient).toBe(true);
    expect(host.status).toBe('closed');
    expect(host.closeReason).toBe('closed');
    vi.advanceTimersByTime(10_000);
    expect(ws.sockets).toHaveLength(1);
    expect(session.getItem(hostTokenStorageKey(GAME))).toBe('secret');
  });

  it('visibilitychange → visible reconnects immediately', async () => {
    const { host, ws, setVisibility } = setup();
    const started = host.start();
    ws.sockets[0]!.open();
    ws.sockets[0]!.receive({ t: 'created', code: 'ABCD', hostToken: 'secret' });
    await started;
    setVisibility('hidden');
    ws.sockets[0]!.drop();
    expect(ws.sockets).toHaveLength(1);
    setVisibility('visible');
    expect(ws.sockets).toHaveLength(2);
  });
});
