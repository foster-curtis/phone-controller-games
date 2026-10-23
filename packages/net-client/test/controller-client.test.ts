import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createControllerClient, getPlayerKey, RelayError } from '../src/api';
import type { ConnectionStatus, ControllerClientOptions } from '../src/api';
import { BACKOFF_MAX_MS, backoffDelay } from '../src/backoff';
import { reconnectTokenStorageKey } from '../src/controller-client';
import type { RelayErrorCode } from '../src/protocol';
import { fakeDocument, fakeWebSocket, fakeWindow, MemoryStorage } from './fakes';

const GAME = 'sunny-side';
const CODE = 'ABCD';
const TOKEN_KEY = reconnectTokenStorageKey(GAME, CODE);

function setup(extra: Partial<ControllerClientOptions> = {}) {
  const ws = fakeWebSocket();
  const session = new MemoryStorage();
  const local = new MemoryStorage();
  const { doc, setVisibility } = fakeDocument('visible');
  const { win, goOnline } = fakeWindow();
  const client = createControllerClient({
    url: 'ws://relay.test',
    game: GAME,
    code: CODE,
    WebSocket: ws.WebSocket,
    sessionStorage: session,
    localStorage: local,
    document: doc,
    window: win,
    ...extra,
  });
  const statuses: ConnectionStatus[] = [];
  client.onStatus((s) => statuses.push(s));
  return { client, ws, session, local, statuses, setVisibility, goOnline };
}

/** Connects and completes the join on socket 0. */
async function joined(ctx: ReturnType<typeof setup>, playerId = 'p1', token = 't1') {
  const p = ctx.client.connect();
  ctx.ws.sockets[0]!.open();
  ctx.ws.sockets[0]!.receive({ t: 'joined', playerId, token });
  await p;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(1); // jitter at its ceiling: deterministic delays
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('backoffDelay', () => {
  it('doubles from 250 ms to a 4 s cap', () => {
    const top = () => 1;
    expect([0, 1, 2, 3, 4, 5, 10, 100].map((n) => backoffDelay(n, top))).toEqual([
      250, 500, 1000, 2000, 4000, 4000, 4000, 4000,
    ]);
  });

  it('applies jitter within [75%, 100%] of the ceiling, never above the cap', () => {
    expect(backoffDelay(0, () => 0)).toBe(188);
    expect(backoffDelay(4, () => 0)).toBe(3000);
    for (let i = 0; i < 50; i++) {
      const d = backoffDelay(6, Math.random);
      expect(d).toBeLessThanOrEqual(BACKOFF_MAX_MS);
    }
  });
});

describe('ControllerClient', () => {
  it('join sends playerKey + stored token, saves the new token to session storage', async () => {
    const ctx = setup();
    ctx.session.setItem(TOKEN_KEY, 'old-token');
    const expectedKey = getPlayerKey(CODE, ctx.local, GAME);
    const p = ctx.client.connect();
    expect(ctx.client.status).toBe('connecting');
    const sock = ctx.ws.sockets[0]!;
    sock.open();
    expect(sock.messages).toEqual([
      { t: 'join', game: GAME, code: CODE, playerKey: expectedKey, token: 'old-token' },
    ]);
    sock.receive({ t: 'joined', playerId: 'p1', token: 'new-token' });
    await expect(p).resolves.toEqual({ playerId: 'p1' });
    expect(ctx.session.getItem(TOKEN_KEY)).toBe('new-token');
    expect(ctx.client.playerId).toBe('p1');
    expect(ctx.client.status).toBe('open');
  });

  it('a first join carries no token; an explicit playerKey is used as-is', async () => {
    const ctx = setup({ playerKey: 'my-key' });
    ctx.client.connect();
    ctx.ws.sockets[0]!.open();
    expect(ctx.ws.sockets[0]!.messages).toEqual([
      { t: 'join', game: GAME, code: CODE, playerKey: 'my-key' },
    ]);
  });

  it('unexpected close → reconnecting with exponential backoff (250 ms → 4 s cap)', async () => {
    const ctx = setup();
    await joined(ctx);
    const delays = [250, 500, 1000, 2000, 4000, 4000];
    for (const [i, delay] of delays.entries()) {
      ctx.ws.sockets[i]!.drop();
      expect(ctx.client.status).toBe('reconnecting');
      vi.advanceTimersByTime(delay - 1);
      expect(ctx.ws.sockets).toHaveLength(i + 1);
      vi.advanceTimersByTime(1);
      expect(ctx.ws.sockets).toHaveLength(i + 2);
    }
    // The rejoin uses the token from the first join; success resets the backoff.
    const sock = ctx.ws.sockets.at(-1)!;
    sock.open();
    expect(sock.last).toMatchObject({ t: 'join', token: 't1' });
    sock.receive({ t: 'joined', playerId: 'p1', token: 't2' });
    expect(ctx.client.status).toBe('open');
    sock.drop();
    vi.advanceTimersByTime(250);
    expect(ctx.ws.sockets).toHaveLength(delays.length + 2);
    expect(ctx.statuses).toEqual(['connecting', 'open', 'reconnecting', 'open', 'reconnecting']);
  });

  it('backoff delays carry jitter', async () => {
    vi.mocked(Math.random).mockReturnValue(0);
    const ctx = setup();
    await joined(ctx);
    ctx.ws.sockets[0]!.drop();
    vi.advanceTimersByTime(187);
    expect(ctx.ws.sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(ctx.ws.sockets).toHaveLength(2);
  });

  it('a socket that never opens keeps retrying and connect() resolves once joined', async () => {
    const ctx = setup();
    const p = ctx.client.connect();
    ctx.ws.sockets[0]!.drop();
    expect(ctx.client.status).toBe('reconnecting');
    vi.advanceTimersByTime(250);
    ctx.ws.sockets[1]!.open();
    ctx.ws.sockets[1]!.receive({ t: 'joined', playerId: 'p9', token: 't' });
    await expect(p).resolves.toEqual({ playerId: 'p9' });
  });

  it('kicked → closed with reason, token forgotten, no reconnect', async () => {
    const ctx = setup();
    await joined(ctx);
    const onKicked = vi.fn();
    ctx.client.onKicked(onKicked);
    ctx.ws.sockets[0]!.receive({ t: 'kicked' });
    ctx.ws.sockets[0]!.drop();
    expect(onKicked).toHaveBeenCalledOnce();
    expect(ctx.client.status).toBe('closed');
    expect(ctx.client.closeReason).toBe('kicked');
    expect(ctx.session.getItem(TOKEN_KEY)).toBeNull();
    vi.advanceTimersByTime(60_000);
    expect(ctx.ws.sockets).toHaveLength(1);
  });

  it.each<RelayErrorCode>(['room-closed', 'no-room'])(
    '%s → closed with reason, no reconnect',
    async (code) => {
      const ctx = setup();
      await joined(ctx);
      const errors: RelayError[] = [];
      ctx.client.onError((e) => errors.push(e));
      ctx.ws.sockets[0]!.receive({ t: 'error', code });
      ctx.ws.sockets[0]!.drop();
      expect(ctx.client.status).toBe('closed');
      expect(ctx.client.closeReason).toBe(code);
      expect(errors.map((e) => e.code)).toEqual([code]);
      expect(ctx.session.getItem(TOKEN_KEY)).toBeNull();
      vi.advanceTimersByTime(60_000);
      expect(ctx.ws.sockets).toHaveLength(1);
    },
  );

  it.each<RelayErrorCode>(['no-room', 'room-full', 'room-locked'])(
    'a join refused with %s rejects connect() with a RelayError',
    async (code) => {
      const ctx = setup();
      const p = ctx.client.connect();
      ctx.ws.sockets[0]!.open();
      ctx.ws.sockets[0]!.receive({ t: 'error', code });
      await expect(p).rejects.toBeInstanceOf(RelayError);
      await expect(p).rejects.toMatchObject({ code });
      expect(ctx.client.status).toBe('closed');
      expect(ctx.client.closeReason).toBe(code);
    },
  );

  it('visibilitychange → visible triggers an immediate reconnect attempt', async () => {
    const ctx = setup();
    await joined(ctx);
    ctx.setVisibility('hidden');
    ctx.ws.sockets[0]!.drop();
    ctx.setVisibility('hidden');
    expect(ctx.ws.sockets).toHaveLength(1);
    ctx.setVisibility('visible');
    expect(ctx.ws.sockets).toHaveLength(2);
    // The pending backoff timer was cancelled: no duplicate attempt.
    vi.advanceTimersByTime(250);
    expect(ctx.ws.sockets).toHaveLength(2);
  });

  it('online triggers an immediate reconnect attempt (not while one is in flight)', async () => {
    const ctx = setup();
    await joined(ctx);
    ctx.ws.sockets[0]!.drop();
    ctx.goOnline();
    expect(ctx.ws.sockets).toHaveLength(2);
    ctx.goOnline();
    expect(ctx.ws.sockets).toHaveLength(2);
  });

  it('visibility / online do nothing while open', async () => {
    const ctx = setup();
    await joined(ctx);
    ctx.setVisibility('visible');
    ctx.goOnline();
    expect(ctx.ws.sockets).toHaveLength(1);
  });

  it('routes host messages and host status; send is dropped while not open', async () => {
    const ctx = setup();
    ctx.client.send('too early'); // no socket yet: dropped, no throw
    await joined(ctx);
    const got: unknown[] = [];
    const host: string[] = [];
    ctx.client.onMessage((d) => got.push(d));
    ctx.client.onHostStatus((s) => host.push(s));
    const sock = ctx.ws.sockets[0]!;
    sock.receive({ t: 'msg', from: 'host', data: { t: 'screen' } });
    sock.receive({ t: 'host', status: 'away' });
    expect(ctx.client.hostStatus).toBe('away');
    sock.receive({ t: 'host', status: 'back' });
    expect(got).toEqual([{ t: 'screen' }]);
    expect(host).toEqual(['away', 'present']);

    ctx.client.send([1, 2, 0, 0, 0]);
    expect(sock.last).toEqual({ t: 'send', data: [1, 2, 0, 0, 0] });
    sock.drop();
    ctx.client.send('while reconnecting');
    expect(sock.messages).toHaveLength(2);
  });

  it('ignores undecodable frames', async () => {
    const ctx = setup();
    await joined(ctx);
    const got: unknown[] = [];
    ctx.client.onMessage((d) => got.push(d));
    ctx.ws.sockets[0]!.receiveRaw('}{ not json');
    expect(got).toEqual([]);
    expect(ctx.client.status).toBe('open');
  });

  it('close() is final', async () => {
    const ctx = setup();
    await joined(ctx);
    ctx.client.close();
    expect(ctx.ws.sockets[0]!.closedByClient).toBe(true);
    expect(ctx.client.status).toBe('closed');
    expect(ctx.client.closeReason).toBe('closed');
    ctx.goOnline();
    vi.advanceTimersByTime(60_000);
    expect(ctx.ws.sockets).toHaveLength(1);
  });
});
