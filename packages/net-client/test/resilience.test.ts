// Dead-socket detection, probes, connect timeout, stats (relay SPEC §3.1, decision #5).
// Fake timers + fake sockets; the real-relay resume test is in resilience.integration.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createControllerClient, createHostClient, HEARTBEAT_DEFAULTS } from '../src/api';
import type { ConnectionStatus, ControllerClientOptions } from '../src/api';
import { BACKOFF_MAX_MS, backoffDelay } from '../src/backoff';
import { fakeDocument, fakeWebSocket, fakeWindow, MemoryStorage } from './fakes';

const HB = HEARTBEAT_DEFAULTS;

function setup(extra: Partial<ControllerClientOptions> = {}) {
  const ws = fakeWebSocket();
  const doc = fakeDocument('visible');
  const win = fakeWindow();
  const client = createControllerClient({
    url: 'ws://relay.test',
    game: 'g',
    code: 'ABCD',
    WebSocket: ws.WebSocket,
    sessionStorage: new MemoryStorage(),
    localStorage: new MemoryStorage(),
    document: doc.doc,
    window: win.win,
    ...extra,
  });
  const statuses: ConnectionStatus[] = [];
  client.onStatus((s) => statuses.push(s));
  const messages: unknown[] = [];
  client.onMessage((m) => messages.push(m));
  return { client, ws, doc, win, statuses, messages };
}
type Ctx = ReturnType<typeof setup>;

/** Connects and completes the join on the latest socket; the relay advertises the heartbeat. */
async function join(ctx: Ctx, heartbeat = true) {
  const p = ctx.client.connect().catch(() => undefined);
  await joinOn(ctx, heartbeat);
  await p;
}

async function joinOn(ctx: Ctx, heartbeat = true, token = 't1') {
  const sock = ctx.ws.sockets.at(-1)!;
  sock.open();
  sock.receive({ t: 'joined', playerId: 'p1', token, ...(heartbeat ? { heartbeat: true } : {}) });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(1); // jitter at its ceiling
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('app heartbeat', () => {
  it('pings every intervalMs, one at a time, and a pong sets rttMs', async () => {
    const ctx = setup();
    await join(ctx);
    const s = ctx.ws.sockets[0]!;
    expect(s.pings).toEqual([]);
    vi.advanceTimersByTime(HB.intervalMs);
    expect(s.pings).toEqual([1]);
    vi.advanceTimersByTime(HB.intervalMs); // still unanswered: no second ping
    expect(s.pings).toEqual([1]);
    vi.advanceTimersByTime(300);
    s.pong(1);
    expect(ctx.client.getStats().rttMs).toBe(HB.intervalMs + 300);
    vi.advanceTimersByTime(HB.intervalMs);
    expect(s.pings).toEqual([1, 2]);
  });

  it('never hands pong frames to the game', async () => {
    const ctx = setup();
    await join(ctx);
    vi.advanceTimersByTime(HB.intervalMs);
    ctx.ws.sockets[0]!.pong(1);
    ctx.ws.sockets[0]!.receive({ t: 'msg', from: 'host', data: 'x' });
    expect(ctx.messages).toEqual(['x']);
  });

  it('a ping unanswered for timeoutMs closes the socket and reconnects right away', async () => {
    const ctx = setup();
    await join(ctx);
    const s = ctx.ws.sockets[0]!;
    vi.advanceTimersByTime(HB.intervalMs);
    vi.advanceTimersByTime(HB.timeoutMs - 1);
    expect(ctx.client.status).toBe('open');
    vi.advanceTimersByTime(1);
    expect(ctx.client.status).toBe('reconnecting');
    expect(s.closedByClient).toBe(true);
    expect(ctx.client.getStats().lastClose).toMatchObject({
      cause: 'heartbeat-timeout',
      code: 0,
    });
    vi.advanceTimersByTime(250); // attempt-0 backoff
    expect(ctx.ws.sockets).toHaveLength(2);
  });

  it('detects a half-open socket that stays OPEN, never answers and never closes', async () => {
    const ctx = setup();
    await join(ctx);
    const dead = ctx.ws.sockets[0]!;
    dead.goHalfOpen();
    vi.advanceTimersByTime(HB.intervalMs + HB.timeoutMs);
    expect(dead.readyState).toBe(1); // the browser still thinks it is open
    expect(ctx.client.status).toBe('reconnecting');
    vi.advanceTimersByTime(250);
    expect(ctx.ws.sockets).toHaveLength(2);
    await joinOn(ctx);
    expect(ctx.client.status).toBe('open');
    // Late events from the abandoned socket never touch state.
    dead.drop();
    dead.receive({ t: 'kicked' });
    expect(ctx.client.status).toBe('open');
    expect(ctx.ws.sockets).toHaveLength(2);
  });

  it('any frame since the ping counts as an answer (throttled tab)', async () => {
    const ctx = setup();
    await join(ctx);
    const s = ctx.ws.sockets[0]!;
    vi.advanceTimersByTime(HB.intervalMs); // ping 1
    vi.advanceTimersByTime(HB.timeoutMs - 100);
    s.receive({ t: 'host', status: 'back' }); // data arrived; the ping's own pong is not needed
    vi.advanceTimersByTime(100); // where the dead timer would have fired
    expect(ctx.client.status).toBe('open');
    expect(s.closedByClient).toBe(false);
  });

  it('a clock that jumped forward does not kill a socket that answered in between', async () => {
    const ctx = setup();
    await join(ctx);
    const s = ctx.ws.sockets[0]!;
    vi.advanceTimersByTime(HB.intervalMs); // ping 1
    s.pong(1);
    // The tab was throttled: the next tick finds the wall clock 60 s later.
    vi.setSystemTime(Date.now() + 60_000);
    vi.advanceTimersByTime(HB.intervalMs); // ping 2
    expect(ctx.client.status).toBe('open');
    expect(s.pings).toEqual([1, 2]);
    expect(ctx.ws.sockets).toHaveLength(1);
  });

  it('intervalMs 0 turns pings off', async () => {
    const ctx = setup({ heartbeat: { intervalMs: 0 } });
    await join(ctx);
    vi.advanceTimersByTime(120_000);
    expect(ctx.ws.sockets[0]!.pings).toEqual([]);
    expect(ctx.client.status).toBe('open');
    ctx.doc.setVisibility('visible');
    expect(ctx.ws.sockets[0]!.pings).toEqual([]);
  });

  it('sends no pings against a relay without the heartbeat flag', async () => {
    const ctx = setup();
    await join(ctx, false);
    vi.advanceTimersByTime(120_000);
    ctx.doc.setVisibility('visible');
    ctx.win.fire('pageshow');
    vi.advanceTimersByTime(60_000);
    expect(ctx.ws.sockets[0]!.pings).toEqual([]);
    expect(ctx.ws.sockets).toHaveLength(1);
    expect(ctx.client.status).toBe('open');
    expect(ctx.client.getStats()).toMatchObject({ heartbeat: false, rttMs: null });
  });

  it('host clients run the heartbeat too', async () => {
    const ws = fakeWebSocket();
    const host = createHostClient({
      url: 'ws://relay.test',
      game: 'g',
      maxPlayers: 4,
      WebSocket: ws.WebSocket,
      sessionStorage: new MemoryStorage(),
    });
    const started = host.start();
    ws.sockets[0]!.open();
    ws.sockets[0]!.receive({ t: 'created', code: 'ABCD', hostToken: 'h', heartbeat: true });
    await started;
    vi.advanceTimersByTime(HB.intervalMs);
    expect(ws.sockets[0]!.pings).toEqual([1]);
    vi.advanceTimersByTime(HB.timeoutMs);
    expect(host.status).toBe('reconnecting');
    expect(host.getStats().lastClose?.cause).toBe('heartbeat-timeout');
    host.close();
  });
});

describe('page lifecycle', () => {
  const triggers: [string, (ctx: Ctx) => void][] = [
    ['visibilitychange to visible', (c) => c.doc.setVisibility('visible')],
    ['pageshow', (c) => c.win.fire('pageshow')],
    ['online', (c) => c.win.goOnline()],
    ['resume', (c) => c.doc.fire('resume')],
    ['focus', (c) => c.win.fire('focus')],
  ];

  it.each(triggers)('%s on an open socket sends a probe; no answer → reconnect', async (_n, go) => {
    const ctx = setup();
    await join(ctx);
    const s = ctx.ws.sockets[0]!;
    go(ctx);
    expect(s.pings).toEqual([1]);
    vi.advanceTimersByTime(HB.probeTimeoutMs - 1);
    expect(ctx.client.status).toBe('open');
    vi.advanceTimersByTime(1);
    expect(ctx.client.status).toBe('reconnecting');
    expect(s.closedByClient).toBe(true);
    expect(ctx.client.getStats().lastClose?.cause).toBe('probe-timeout');
    vi.advanceTimersByTime(250);
    expect(ctx.ws.sockets).toHaveLength(2);
  });

  it.each(triggers)('%s on an open socket that answers keeps it', async (_n, go) => {
    const ctx = setup();
    await join(ctx);
    const s = ctx.ws.sockets[0]!;
    go(ctx);
    vi.advanceTimersByTime(500);
    s.pong(1);
    vi.advanceTimersByTime(HB.probeTimeoutMs * 2);
    expect(ctx.client.status).toBe('open');
    expect(ctx.ws.sockets).toHaveLength(1);
  });

  it('hidden does not probe', async () => {
    const ctx = setup();
    await join(ctx);
    ctx.doc.setVisibility('hidden');
    expect(ctx.ws.sockets[0]!.pings).toEqual([]);
  });

  it.each(triggers)('%s while reconnecting retries at once', async (_n, go) => {
    const ctx = setup();
    await join(ctx);
    ctx.ws.sockets[0]!.drop();
    expect(ctx.client.status).toBe('reconnecting');
    expect(ctx.ws.sockets).toHaveLength(1);
    go(ctx);
    expect(ctx.ws.sockets).toHaveLength(2);
  });

  it('a burst of events opens one socket while reconnecting', async () => {
    const ctx = setup();
    await join(ctx);
    ctx.ws.sockets[0]!.drop();
    for (const [, go] of triggers) go(ctx);
    for (const [, go] of triggers) go(ctx);
    expect(ctx.ws.sockets).toHaveLength(2);
    vi.advanceTimersByTime(HB.connectTimeoutMs - 1);
    expect(ctx.ws.sockets).toHaveLength(2);
  });

  it('a burst of events on an open socket sends one probe and causes one reconnect', async () => {
    const ctx = setup();
    await join(ctx);
    const s = ctx.ws.sockets[0]!;
    for (const [, go] of triggers) go(ctx);
    for (const [, go] of triggers) go(ctx);
    expect(s.pings).toEqual([1]);
    vi.advanceTimersByTime(HB.probeTimeoutMs);
    for (const [, go] of triggers) go(ctx); // while reconnecting: wakes once
    vi.advanceTimersByTime(250);
    expect(ctx.ws.sockets).toHaveLength(2);
  });

  it('stop() removes every listener', async () => {
    const ctx = setup();
    await join(ctx);
    expect(ctx.doc.listeners()).toBeGreaterThan(0);
    expect(ctx.win.listeners()).toBeGreaterThan(0);
    ctx.client.close();
    expect(ctx.doc.listeners()).toBe(0);
    expect(ctx.win.listeners()).toBe(0);
    for (const [, go] of triggers) go(ctx);
    vi.advanceTimersByTime(120_000);
    expect(ctx.ws.sockets).toHaveLength(1);
    expect(ctx.ws.sockets[0]!.pings).toEqual([]);
  });
});

describe('connect timeout', () => {
  it('a socket that never opens is closed and retried', () => {
    const ctx = setup();
    void ctx.client.connect().catch(() => undefined);
    const first = ctx.ws.sockets[0]!;
    vi.advanceTimersByTime(HB.connectTimeoutMs - 1);
    expect(first.closedByClient).toBe(false);
    vi.advanceTimersByTime(1);
    expect(first.closedByClient).toBe(true);
    expect(ctx.client.status).toBe('reconnecting');
    expect(ctx.client.getStats()).toMatchObject({
      failedAttempts: 1,
      lastClose: { cause: 'connect-timeout', code: 0 },
    });
    vi.advanceTimersByTime(250);
    expect(ctx.ws.sockets).toHaveLength(2);
    // The abandoned socket is deaf.
    first.open();
    expect(ctx.ws.sockets[0]!.sent).toEqual([]);
  });

  it('a socket that opens but never completes the handshake is retried too', () => {
    const ctx = setup();
    void ctx.client.connect().catch(() => undefined);
    ctx.ws.sockets[0]!.open();
    vi.advanceTimersByTime(HB.connectTimeoutMs);
    expect(ctx.client.status).toBe('reconnecting');
    expect(ctx.client.getStats().lastClose?.cause).toBe('connect-timeout');
  });

  it('is cancelled by the handshake and by close()', async () => {
    const ctx = setup();
    await join(ctx);
    vi.advanceTimersByTime(HB.connectTimeoutMs * 2);
    expect(ctx.ws.sockets).toHaveLength(1);
    const other = setup();
    void other.client.connect().catch(() => undefined);
    other.client.close();
    vi.advanceTimersByTime(HB.connectTimeoutMs * 2);
    expect(other.ws.sockets).toHaveLength(1);
  });

  it('honors a custom connectTimeoutMs', () => {
    const ctx = setup({ heartbeat: { connectTimeoutMs: 1_000 } });
    void ctx.client.connect().catch(() => undefined);
    vi.advanceTimersByTime(1_000);
    expect(ctx.client.status).toBe('reconnecting');
  });
});

describe('no duplicate sockets', () => {
  it('after a heartbeat reconnect the old socket is gone and the new one is the only one live', async () => {
    const ctx = setup();
    await join(ctx);
    vi.advanceTimersByTime(HB.intervalMs + HB.timeoutMs + 250);
    expect(ctx.ws.sockets).toHaveLength(2);
    await joinOn(ctx, true, 't2');
    expect(ctx.client.status).toBe('open');
    vi.advanceTimersByTime(HB.intervalMs);
    expect(ctx.ws.sockets[0]!.pings).toEqual([1]);
    expect(ctx.ws.sockets[1]!.pings).toEqual([2]);
  });

  it('the reconnect rejoin sends the stored token, so the relay resumes the slot', async () => {
    const ctx = setup();
    await join(ctx);
    vi.advanceTimersByTime(HB.intervalMs + HB.timeoutMs + 250);
    ctx.ws.sockets[1]!.open();
    expect(ctx.ws.sockets[1]!.last).toMatchObject({ t: 'join', token: 't1' });
  });
});

describe('backoff', () => {
  it('stays within [75%, 100%] of a ceiling that doubles from 250 ms to 4 s', () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const ceiling = Math.min(BACKOFF_MAX_MS, 250 * 2 ** attempt);
      for (const r of [0, 0.5, 0.999]) {
        const d = backoffDelay(attempt, () => r);
        expect(d).toBeGreaterThanOrEqual(Math.round(ceiling * 0.75));
        expect(d).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it('a heartbeat-timeout reconnect restarts the backoff at attempt 0', async () => {
    const ctx = setup();
    await join(ctx);
    // Fail a few reconnects so the backoff grows.
    ctx.ws.sockets[0]!.drop();
    for (let i = 1; i <= 3; i++) {
      vi.advanceTimersByTime(BACKOFF_MAX_MS);
      ctx.ws.sockets[i]!.drop();
    }
    vi.advanceTimersByTime(BACKOFF_MAX_MS);
    await joinOn(ctx);
    expect(ctx.client.status).toBe('open');
    const count = ctx.ws.sockets.length;
    vi.advanceTimersByTime(HB.intervalMs + HB.timeoutMs);
    expect(ctx.client.status).toBe('reconnecting');
    vi.advanceTimersByTime(250);
    expect(ctx.ws.sockets).toHaveLength(count + 1);
  });
});

describe('getStats', () => {
  it('reports reconnects, failed attempts, last close, rtt, heartbeat and timestamps', async () => {
    let t = 1_000_000;
    const ctx = setup({ now: () => t });
    expect(ctx.client.getStats()).toEqual({
      status: 'idle',
      reconnects: 0,
      failedAttempts: 0,
      lastClose: null,
      rttMs: null,
      heartbeat: false,
      lastMessageAt: null,
      openSince: null,
    });
    void ctx.client.connect().catch(() => undefined);
    // A socket that closes before the handshake is a failed attempt.
    ctx.ws.sockets[0]!.drop({ code: 1006, reason: 'nope', wasClean: false });
    expect(ctx.client.getStats()).toMatchObject({
      status: 'reconnecting',
      failedAttempts: 1,
      lastClose: { cause: 'socket', code: 1006, reason: 'nope', wasClean: false, at: t },
    });
    vi.advanceTimersByTime(250);
    t += 5;
    await joinOn(ctx);
    let stats = ctx.client.getStats();
    expect(stats).toMatchObject({
      status: 'open',
      reconnects: 0,
      heartbeat: true,
      openSince: t,
      lastMessageAt: t,
    });
    vi.advanceTimersByTime(HB.intervalMs);
    t += 40;
    ctx.ws.sockets[1]!.pong(1);
    expect(ctx.client.getStats().rttMs).toBe(40);

    ctx.ws.sockets[1]!.drop({ code: 1001, reason: 'bye', wasClean: true });
    stats = ctx.client.getStats();
    expect(stats.openSince).toBeNull();
    expect(stats.lastClose).toMatchObject({ code: 1001, wasClean: true });
    vi.advanceTimersByTime(250);
    await joinOn(ctx);
    expect(ctx.client.getStats()).toMatchObject({ reconnects: 1, failedAttempts: 1 });

    ctx.client.close();
    expect(ctx.client.getStats()).toMatchObject({
      status: 'closed',
      openSince: null,
      lastClose: { cause: 'local', code: 0 },
    });
  });
});
