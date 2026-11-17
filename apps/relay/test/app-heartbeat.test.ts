// App-level ping/pong, the heartbeat flag, and the connection log (relay SPEC §3, §3.1, decision #5).
import { describe, expect, it } from 'vitest';
import type { RelayLogEvent } from '../src/index';
import { connect, createRoom, joinRoom, sleep, startRelay } from './helpers';

describe('app ping/pong', () => {
  it('answers a ping from a socket in no role', async () => {
    const relay = await startRelay();
    const c = await connect(relay);
    c.send({ t: 'ping', n: 7 });
    expect(await c.next('pong')).toEqual({ t: 'pong', n: 7 });
  });

  it('answers hosts and phones, to the pinging socket only', async () => {
    const relay = await startRelay();
    const { host, code } = await createRoom(relay);
    const a = await joinRoom(relay, code);
    const b = await joinRoom(relay, code);
    await host.drain(50);
    host.send({ t: 'ping', n: 1 });
    a.phone.send({ t: 'ping', n: 2 });
    expect(await host.next('pong')).toEqual({ t: 'pong', n: 1 });
    expect(await a.phone.next('pong')).toEqual({ t: 'pong', n: 2 });
    expect((await b.phone.drain(50)).some((m) => m.t === 'pong')).toBe(false);
    expect((await host.drain(50)).some((m) => m.t === 'pong')).toBe(false);
  });

  it('rejects a ping without a numeric n', async () => {
    const relay = await startRelay();
    const c = await connect(relay);
    c.send({ t: 'ping' });
    expect(await c.next('error')).toMatchObject({ code: 'bad-request' });
  });

  it('a ping does not change the socket role', async () => {
    const relay = await startRelay();
    const c = await connect(relay);
    c.send({ t: 'ping', n: 1 });
    await c.next('pong');
    c.send({ t: 'create', game: 'g', maxPlayers: 2 });
    expect((await c.next('created')).code).toHaveLength(4);
  });

  it('any inbound message resets the missed-ping count', async () => {
    const relay = await startRelay({ pingIntervalMs: 50, maxMissedPings: 2 });
    const c = await connect(relay, { autoPong: false });
    const timer = setInterval(() => c.send({ t: 'ping', n: 1 }), 20);
    await sleep(400);
    clearInterval(timer);
    expect(c.isClosed).toBe(false);
  });
});

describe('heartbeat flag', () => {
  it('is on created, reclaimed and joined', async () => {
    const relay = await startRelay({ hostReclaimMs: 2_000 });
    const c = await connect(relay);
    c.send({ t: 'create', game: 'g', maxPlayers: 4 });
    const created = await c.next('created');
    expect(created.heartbeat).toBe(true);
    const phone = await connect(relay);
    phone.send({ t: 'join', game: 'g', code: created.code, playerKey: 'k' });
    expect((await phone.next('joined')).heartbeat).toBe(true);
    const host2 = await connect(relay);
    host2.send({ t: 'reclaim', hostToken: created.hostToken });
    expect((await host2.next('reclaimed')).heartbeat).toBe(true);
  });
});

describe('connection log', () => {
  function logging() {
    const events: RelayLogEvent[] = [];
    return { events, log: (e: RelayLogEvent) => events.push(e) };
  }

  it('records connect with the user agent, the room events and close', async () => {
    const { events, log } = logging();
    const relay = await startRelay({ log, playerReconnectMs: 100, hostReclaimMs: 100 });
    const { host, code } = await createRoom(relay);
    const ws = await connect(relay, { headers: { 'user-agent': 'DuckDuckGo/5 test' } });
    ws.send({ t: 'join', game: 'test-game', code, playerKey: 'k' });
    const joined = await ws.next('joined');
    ws.send({ t: 'nope' });
    await ws.next('error');
    ws.close();
    await ws.closed;
    await sleep(250); // reconnect window runs out
    host.close();
    await host.closed;
    await sleep(250); // host window runs out

    const phoneConnect = events.find((e) => e.kind === 'connect' && e.ua);
    expect(phoneConnect?.ua).toBe('DuckDuckGo/5 test');
    const conns = events.filter((e) => e.kind === 'connect').map((e) => e.conn);
    expect(new Set(conns).size).toBe(conns.length);
    expect(events.find((e) => e.kind === 'create')).toMatchObject({ role: 'host', code });
    expect(events.find((e) => e.kind === 'join')).toMatchObject({
      conn: phoneConnect?.conn,
      playerId: joined.playerId,
      code,
    });
    expect(events.find((e) => e.kind === 'error')).toMatchObject({ errorCode: 'bad-request' });
    const close = events.find((e) => e.kind === 'close' && e.conn === phoneConnect?.conn);
    expect(close).toMatchObject({ cause: 'client', role: 'phone' });
    expect(close?.durationMs).toBeGreaterThanOrEqual(0);
    expect(events.find((e) => e.kind === 'player-expired')).toMatchObject({
      playerId: joined.playerId,
    });
    expect(events.find((e) => e.kind === 'room-closed')).toMatchObject({ code });
    // No payloads or addresses anywhere in the log.
    expect(JSON.stringify(events)).not.toMatch(/127\.0\.0\.1|"data"/);
  });

  it('logs a rejoin with takeover while the old socket is still open', async () => {
    const { events, log } = logging();
    const relay = await startRelay({ log });
    const { code } = await createRoom(relay);
    const a = await joinRoom(relay, code, 'k1');
    const b = await joinRoom(relay, code, 'k1', a.token);
    expect(b.playerId).toBe(a.playerId);
    expect(events.filter((e) => e.kind === 'join')).toHaveLength(1);
    expect(events.find((e) => e.kind === 'rejoin')).toMatchObject({
      takeover: true,
      playerId: a.playerId,
    });
    await a.phone.closed;
    expect(
      events.find((e) => e.kind === 'close' && e.reason === 'rejoined elsewhere'),
    ).toMatchObject({ cause: 'server' });
  });

  it('logs a rejoin without takeover after the old socket closed', async () => {
    const { events, log } = logging();
    const relay = await startRelay({ log, playerReconnectMs: 2_000 });
    const { code } = await createRoom(relay);
    const a = await joinRoom(relay, code, 'k1');
    a.phone.close();
    await a.phone.closed;
    await sleep(50);
    await joinRoom(relay, code, 'k1', a.token);
    expect(events.find((e) => e.kind === 'rejoin')).toMatchObject({ takeover: false });
  });

  it('logs a kick', async () => {
    const { events, log } = logging();
    const relay = await startRelay({ log });
    const { host, code } = await createRoom(relay);
    const a = await joinRoom(relay, code);
    host.send({ t: 'kick', playerId: a.playerId });
    await a.phone.closed;
    expect(events.find((e) => e.kind === 'kick')).toMatchObject({ playerId: a.playerId });
  });

  it('marks a socket killed by missed pings with cause heartbeat', async () => {
    const { events, log } = logging();
    const relay = await startRelay({ log, pingIntervalMs: 40, maxMissedPings: 2 });
    const { code } = await createRoom(relay);
    const sleeper = await connect(relay, { autoPong: false });
    sleeper.send({ t: 'join', game: 'test-game', code, playerKey: 'z' });
    await sleeper.next('joined');
    await sleeper.closed;
    await sleep(50);
    expect(events.find((e) => e.kind === 'close' && e.cause === 'heartbeat')).toMatchObject({
      role: 'phone',
    });
  });

  it('a throwing log sink does not break the relay', async () => {
    const relay = await startRelay({
      log: () => {
        throw new Error('boom');
      },
    });
    const { code } = await createRoom(relay);
    const a = await joinRoom(relay, code);
    expect(a.playerId).toBeTruthy();
  });
});
