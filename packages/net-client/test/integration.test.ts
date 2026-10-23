// Host + controllers against the real relay (Node's global WebSocket, port 0, tiny timeouts).
// The packages/** → apps/** boundary allows this one test-only import of the relay.
// eslint-disable-next-line no-restricted-imports
import { createRelay } from '@pcg/relay';
// eslint-disable-next-line no-restricted-imports
import type { Relay } from '@pcg/relay';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createControllerClient, createHostClient } from '../src/api';
import type {
  ConnectionStatus,
  ControllerClient,
  HostClient,
  HostRoom,
  PeerChange,
  Unsubscribe,
  WebSocketCtor,
} from '../src/api';
import { MemoryStorage } from './fakes';

const GAME = 'net-client-it';
const RELAY_OPTS = {
  port: 0,
  host: '127.0.0.1',
  playerReconnectMs: 3_000,
  hostReclaimMs: 3_000,
  pingIntervalMs: 500,
  maxMissedPings: 4,
};

/**
 * Until M1 lands, `createRelay` is a stub that throws "not implemented": skip (logged) rather
 * than fail. Any other failure is a real error.
 */
async function relayImplemented(): Promise<boolean> {
  try {
    const relay = await createRelay({ ...RELAY_OPTS });
    await relay.close();
    return true;
  } catch (err) {
    if (err instanceof Error && /not implemented/.test(err.message)) {
      console.warn('integration.test.ts skipped: createRelay is still the M0 stub (pending M1)');
      return false;
    }
    throw err;
  }
}

const ready = await relayImplemented();

/** WebSocket ctor that records every socket it makes, so a test can force-close one. */
function trackedWebSocket(): { sockets: WebSocket[]; WebSocket: WebSocketCtor } {
  const sockets: WebSocket[] = [];
  class Tracked extends globalThis.WebSocket {
    constructor(url: string) {
      super(url);
      sockets.push(this);
    }
  }
  return { sockets, WebSocket: Tracked };
}

/** Resolves with the first value an emitter delivers that matches `pred`. */
function next<T>(
  subscribe: (cb: (v: T) => void) => Unsubscribe,
  pred: (v: T) => boolean = () => true,
  timeoutMs = 5_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error('timed out waiting for event'));
    }, timeoutMs);
    const off = subscribe((v) => {
      if (!pred(v)) return;
      clearTimeout(timer);
      off();
      resolve(v);
    });
  });
}

describe.skipIf(!ready)('net-client ↔ real relay', () => {
  let relay: Relay;
  let url: string;
  let host: HostClient;
  let hostWs: ReturnType<typeof trackedWebSocket>;
  const phones: { client: ControllerClient; ws: ReturnType<typeof trackedWebSocket> }[] = [];
  const peerEvents: PeerChange[] = [];
  let code: string;
  let p1: string;
  let p2: string;

  beforeAll(async () => {
    relay = await createRelay({ ...RELAY_OPTS });
    url = `ws://127.0.0.1:${relay.port}`;
    hostWs = trackedWebSocket();
    host = createHostClient({
      url,
      game: GAME,
      maxPlayers: 4,
      WebSocket: hostWs.WebSocket,
      sessionStorage: new MemoryStorage(),
      localStorage: new MemoryStorage(),
    });
    host.onPeer((p) => peerEvents.push(p));
  });

  afterAll(async () => {
    for (const p of phones) p.client.close();
    host?.close();
    await relay?.close();
  });

  function phone(): ControllerClient {
    const ws = trackedWebSocket();
    const client = createControllerClient({
      url,
      game: GAME,
      code,
      WebSocket: ws.WebSocket,
      sessionStorage: new MemoryStorage(),
      localStorage: new MemoryStorage(),
    });
    phones.push({ client, ws });
    return client;
  }

  it('host + 2 controllers exchange messages', async () => {
    const room = await host.start();
    expect(room.reclaimed).toBe(false);
    code = room.code;
    expect(code).toMatch(/^[A-Z]{4}$/);

    const joins = next(host.onPeer.bind(host), () => peerEvents.length >= 2);
    const c1 = phone();
    const c2 = phone();
    ({ playerId: p1 } = await c1.connect());
    ({ playerId: p2 } = await c2.connect());
    expect(p1).not.toBe(p2);
    await joins;
    expect(peerEvents.map((e) => [e.event, e.playerId])).toEqual([
      ['joined', p1],
      ['joined', p2],
    ]);

    // phone → host (relay stamps `from`)
    const fromP2 = next<[string, unknown]>((cb) => host.onMessage((f, d) => cb([f, d])));
    c2.send([10, -20, 1, 1, 0]);
    expect(await fromP2).toEqual([p2, [10, -20, 1, 1, 0]]);

    // host → all
    const b1 = next(c1.onMessage.bind(c1));
    const b2 = next(c2.onMessage.bind(c2));
    host.send({ hello: 'all' });
    expect(await b1).toEqual({ hello: 'all' });
    expect(await b2).toEqual({ hello: 'all' });

    // host → one
    const only1 = next(c1.onMessage.bind(c1));
    const c2Got: unknown[] = [];
    const off = c2.onMessage((d) => c2Got.push(d));
    host.send({ hello: 'p1' }, p1);
    expect(await only1).toEqual({ hello: 'p1' });
    await new Promise((r) => setTimeout(r, 100));
    off();
    expect(c2Got).toEqual([]);
  });

  it('a force-closed controller socket returns with the same playerId', async () => {
    const { client: c1, ws } = phones[0]!;
    const back = next<ConnectionStatus>(c1.onStatus.bind(c1), (s) => s === 'open');
    const rejoined = next(host.onPeer.bind(host), (p) => p.event === 'rejoined');
    ws.sockets.at(-1)!.close();
    await back;
    expect(c1.playerId).toBe(p1);
    expect(await rejoined).toMatchObject({ playerId: p1 });
    expect(ws.sockets.length).toBeGreaterThan(1);

    const msg = next<[string, unknown]>((cb) => host.onMessage((f, d) => cb([f, d])));
    c1.send('still here');
    expect(await msg).toEqual([p1, 'still here']);
  });

  it('a force-closed host socket reclaims and the roster lists both controllers', async () => {
    const reclaimed = next<HostRoom>(host.onRoom.bind(host), (r) => r.reclaimed);
    hostWs.sockets.at(-1)!.close();
    const room = await reclaimed;
    expect(room.code).toBe(code);
    expect(host.code).toBe(code);
    expect(host.status).toBe('open');
    expect(room.roster.map((r) => r.playerId).sort()).toEqual([p1, p2].sort());

    // Traffic flows again in both directions.
    const { client: c2 } = phones[1]!;
    const toC2 = next(c2.onMessage.bind(c2));
    host.send('back', p2);
    expect(await toC2).toBe('back');
  });
});
