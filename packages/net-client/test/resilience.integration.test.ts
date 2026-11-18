// A phone whose socket goes silent resumes into the same slot against the real relay
// (relay SPEC §3.1, decision #5). Real timers, tiny heartbeat values, port 0.
// eslint-disable-next-line no-restricted-imports
import { createRelay } from '@pcg/relay';
// eslint-disable-next-line no-restricted-imports
import type { Relay } from '@pcg/relay';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createControllerClient, createHostClient } from '../src/api';
import type { ConnectionStatus, PeerChange, Unsubscribe, WebSocketCtor } from '../src/api';
import { MemoryStorage } from './fakes';

const GAME = 'net-client-resilience';
const HEARTBEAT = { intervalMs: 40, timeoutMs: 120, probeTimeoutMs: 60, connectTimeoutMs: 1_000 };

/** A WebSocket whose inbound frames can be swallowed: the socket looks open but is deaf. */
function muteableWebSocket(): { sockets: MuteSocket[]; WebSocket: WebSocketCtor } {
  const sockets: MuteSocket[] = [];
  const desc = Object.getOwnPropertyDescriptor(globalThis.WebSocket.prototype, 'onmessage')!;
  class MuteSocket extends globalThis.WebSocket {
    muted = false;
    constructor(url: string) {
      super(url);
      sockets.push(this);
      Object.defineProperty(this, 'onmessage', {
        configurable: true,
        get: () => desc.get!.call(this) as unknown,
        set: (fn: ((ev: MessageEvent) => void) | null) =>
          desc.set!.call(this, fn ? (ev: MessageEvent) => !this.muted && fn(ev) : fn),
      });
    }
  }
  return { sockets, WebSocket: MuteSocket };
}
type MuteSocket = WebSocket & { muted: boolean };

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

describe('heartbeat-timeout reconnect against the real relay', () => {
  let relay: Relay;
  beforeAll(async () => {
    relay = await createRelay({
      port: 0,
      host: '127.0.0.1',
      playerReconnectMs: 3_000,
      hostReclaimMs: 3_000,
      pingIntervalMs: 5_000,
    });
  });
  afterAll(async () => {
    await relay.close();
  });

  it('resumes the same slot: same playerId, host sees rejoined, never a second joined', async () => {
    const url = `ws://127.0.0.1:${relay.port}`;
    const host = createHostClient({
      url,
      game: GAME,
      maxPlayers: 4,
      sessionStorage: new MemoryStorage(),
      heartbeat: HEARTBEAT,
    });
    const peers: PeerChange[] = [];
    host.onPeer((p) => peers.push(p));
    const { code } = await host.start();
    expect(host.getStats().heartbeat).toBe(true);

    const ws = muteableWebSocket();
    const phone = createControllerClient({
      url,
      game: GAME,
      code,
      WebSocket: ws.WebSocket,
      sessionStorage: new MemoryStorage(),
      localStorage: new MemoryStorage(),
      heartbeat: HEARTBEAT,
    });
    const { playerId } = await phone.connect();
    expect(phone.getStats().heartbeat).toBe(true);

    // A healthy socket stays up well past the timeout and measures an RTT.
    await new Promise((r) => setTimeout(r, HEARTBEAT.timeoutMs * 2));
    expect(ws.sockets).toHaveLength(1);
    expect(phone.getStats().rttMs).not.toBeNull();

    // Now the phone goes deaf: no pong, no data. It must notice and come back by itself.
    const statuses: ConnectionStatus[] = [];
    phone.onStatus((s) => statuses.push(s));
    const back = next<ConnectionStatus>(phone.onStatus.bind(phone), (s) => s === 'open');
    ws.sockets[0]!.muted = true;
    await back;

    expect(statuses).toEqual(['reconnecting', 'open']);
    expect(phone.playerId).toBe(playerId);
    expect(ws.sockets).toHaveLength(2);
    expect(phone.getStats()).toMatchObject({
      reconnects: 1,
      lastClose: { cause: 'heartbeat-timeout' },
    });
    await new Promise((r) => setTimeout(r, 100));
    // Same slot: one 'joined' ever, and the host's last word is 'rejoined'. (The abandoned socket
    // still sends its close frame here, so a 'left' may come first; a real half-open one never does.)
    expect(peers.filter((p) => p.event === 'joined')).toHaveLength(1);
    expect(new Set(peers.map((p) => p.playerId))).toEqual(new Set([playerId]));
    expect(peers.at(-1)).toMatchObject({ event: 'rejoined', playerId });

    // Traffic flows on the new socket, and only one player exists.
    const got = next<[string, unknown]>((cb) => host.onMessage((f, d) => cb([f, d])));
    phone.send('hi');
    expect(await got).toEqual([playerId, 'hi']);

    phone.close();
    host.close();
  });
});
