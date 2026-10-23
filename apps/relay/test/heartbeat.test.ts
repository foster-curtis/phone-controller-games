import { describe, expect, it } from 'vitest';
import { connect, createRoom, joinRoom, sleep, startRelay } from './helpers';

const PING = 50;
const MAX_MISSED = 2;

describe('heartbeat', () => {
  it('a client that never answers pings is dropped after maxMissedPings intervals', async () => {
    const relay = await startRelay({ pingIntervalMs: PING, maxMissedPings: MAX_MISSED });
    const { host, code } = await createRoom(relay);
    const sleeper = await connect(relay, { autoPong: false });
    sleeper.send({ t: 'join', game: 'test-game', code, playerKey: 'zzz' });
    const { playerId } = await sleeper.next('joined');
    await host.next('peer');

    const started = Date.now();
    await sleeper.closed;
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(PING * (MAX_MISSED - 1));
    expect(elapsed).toBeLessThan(PING * (MAX_MISSED + 3) + 500);
    expect(await host.next('peer')).toMatchObject({ event: 'left', playerId });
  });

  it('a client that answers pings stays connected', async () => {
    const relay = await startRelay({ pingIntervalMs: PING, maxMissedPings: MAX_MISSED });
    const { host, code } = await createRoom(relay);
    const a = await joinRoom(relay, code);
    await sleep(PING * (MAX_MISSED + 4));
    expect(a.phone.isClosed).toBe(false);
    expect(host.isClosed).toBe(false);
    a.phone.send({ t: 'send', data: 'alive' });
    expect(await host.next('msg')).toMatchObject({ data: 'alive' });
  });
});
