// Test helpers: a real relay on an ephemeral port + queue-based ws clients.
import { afterEach } from 'vitest';
import WebSocket, { type ClientOptions } from 'ws';
import type { ClientToRelay, RelayToClient } from '@pcg/net-client';
import { createRelay, type Relay, type RelayOptions } from '../src/index';

export const GAME = 'test-game';

/** Short windows so timer-driven behavior runs on real timers (no fake timers with sockets). */
export const FAST: RelayOptions = {
  playerReconnectMs: 200,
  hostReclaimMs: 200,
  pingIntervalMs: 5_000,
};

const relays: Relay[] = [];
const clients: TestClient[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.ws.terminate();
  await Promise.all(relays.splice(0).map((r) => r.close()));
});

export async function startRelay(opts: RelayOptions = {}): Promise<Relay> {
  const relay = await createRelay({ port: 0, host: '127.0.0.1', ...FAST, ...opts });
  relays.push(relay);
  return relay;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class TestClient {
  private queue: RelayToClient[] = [];
  private waiters: Array<() => void> = [];
  readonly closed: Promise<{ code: number; reason: string }>;
  isClosed = false;

  constructor(readonly ws: WebSocket) {
    ws.on('message', (raw) => {
      this.queue.push(JSON.parse(String(raw)) as RelayToClient);
      this.wake();
    });
    this.closed = new Promise((resolve) => {
      ws.on('close', (code, reason) => {
        this.isClosed = true;
        this.wake();
        resolve({ code, reason: String(reason) });
      });
    });
    ws.on('error', () => {});
  }

  private wake() {
    for (const w of this.waiters.splice(0)) w();
  }

  send(msg: ClientToRelay | Record<string, unknown>) {
    this.ws.send(JSON.stringify(msg));
  }

  sendRaw(raw: string | Buffer) {
    this.ws.send(raw);
  }

  /** Next message of type `t` (earlier messages of other types are skipped and dropped). */
  async next<T extends RelayToClient['t']>(
    t: T,
    timeoutMs = 1_000,
  ): Promise<Extract<RelayToClient, { t: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = this.queue.findIndex((m) => m.t === t);
      if (i >= 0) {
        const [m] = this.queue.splice(0, i + 1).slice(-1);
        return m as Extract<RelayToClient, { t: T }>;
      }
      const left = deadline - Date.now();
      if (left <= 0) {
        throw new Error(`timed out waiting for "${t}"; queue: ${JSON.stringify(this.queue)}`);
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  /** Waits `ms` and returns every message received meanwhile (and anything already queued). */
  async drain(ms = 100): Promise<RelayToClient[]> {
    await sleep(ms);
    return this.queue.splice(0);
  }

  close() {
    this.ws.close();
  }
}

export async function connect(relay: Relay, opts: ClientOptions = {}): Promise<TestClient> {
  const ws = new WebSocket(`ws://127.0.0.1:${relay.port}`, opts);
  const client = new TestClient(ws);
  clients.push(client);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return client;
}

export async function createRoom(relay: Relay, maxPlayers = 8, game = GAME) {
  const host = await connect(relay);
  host.send({ t: 'create', game, maxPlayers });
  const created = await host.next('created');
  return { host, code: created.code, hostToken: created.hostToken };
}

export async function joinRoom(
  relay: Relay,
  code: string,
  playerKey = `key-${Math.random().toString(36).slice(2)}`,
  token?: string,
  game = GAME,
) {
  const phone = await connect(relay);
  phone.send({ t: 'join', game, code, playerKey, ...(token ? { token } : {}) });
  const joined = await phone.next('joined');
  return { phone, playerId: joined.playerId, token: joined.token, playerKey };
}
