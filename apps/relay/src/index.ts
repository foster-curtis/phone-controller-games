// Game-agnostic WebSocket relay. Frozen at F0 (createRelay / RelayOptions); M1 implements it.
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type RawData } from 'ws';
import { startHeartbeat } from './heartbeat';
import { createHttpServer } from './http';
import { Rooms } from './rooms';

export interface RelayOptions {
  /** TCP port; 0 = ephemeral (tests). Default 8787. */
  port?: number;
  /** Bind address. Default: all interfaces. */
  host?: string;
  /** Phone reconnect window. Default 30 000. */
  playerReconnectMs?: number;
  /** Host reclaim window. Default 120 000. */
  hostReclaimMs?: number;
  /** Heartbeat interval. Default 5 000. */
  pingIntervalMs?: number;
  /** Drop a socket after this many unanswered pings. Default 2. */
  maxMissedPings?: number;
  /** Max inbound message size in bytes. Default 16 KB. */
  maxPayloadBytes?: number;
  /**
   * Connection log sink (added at F0 of controller-compat). Default none. `main.ts` turns it on with
   * `RELAY_LOG=1` (one JSON line per event on stdout); the LAN dev script always does.
   */
  log?: (event: RelayLogEvent) => void;
}

/**
 * One connection-lifecycle event. Holds no message payloads and no IP addresses; the user agent
 * appears only on `connect`.
 */
export interface RelayLogEvent {
  /** `Date.now()`. */
  at: number;
  kind:
    | 'connect' // socket opened (ua)
    | 'create' // host created a room
    | 'reclaim' // host reclaimed a room
    | 'join' // new phone slot
    | 'rejoin' // phone took its slot back with its token (takeover: the old socket was still open)
    | 'close' // socket closed (closeCode, reason, cause)
    | 'kick'
    | 'player-expired' // reconnect window ran out; the slot is gone
    | 'room-closed' // host reclaim window ran out
    | 'error'; // an `error` reply (errorCode)
  /** Per-process socket number, so one socket's events can be followed. */
  conn: number;
  role?: 'host' | 'phone' | 'none';
  game?: string;
  code?: string;
  playerId?: string;
  ua?: string;
  takeover?: boolean;
  closeCode?: number;
  reason?: string;
  /** For `close`: `client` (the peer closed), `heartbeat` (terminated for missed pings), `server`. */
  cause?: 'client' | 'heartbeat' | 'server';
  /** For `close`: how long the socket was open, in ms. */
  durationMs?: number;
  errorCode?: string;
}

export interface Relay {
  /** The bound port (useful with `port: 0`). */
  port: number;
  close(): Promise<void>;
}

export const RELAY_DEFAULTS = {
  port: 8787,
  playerReconnectMs: 30_000,
  hostReclaimMs: 120_000,
  pingIntervalMs: 5_000,
  maxMissedPings: 2,
  maxPayloadBytes: 16 * 1024,
  /** `create.maxPlayers` is clamped to 1..maxPlayersCap. */
  maxPlayersCap: 16,
} as const;

export async function createRelay(opts: RelayOptions = {}): Promise<Relay> {
  const pingIntervalMs = opts.pingIntervalMs ?? RELAY_DEFAULTS.pingIntervalMs;
  const maxMissedPings = opts.maxMissedPings ?? RELAY_DEFAULTS.maxMissedPings;
  const rooms = new Rooms({
    playerReconnectMs: opts.playerReconnectMs ?? RELAY_DEFAULTS.playerReconnectMs,
    hostReclaimMs: opts.hostReclaimMs ?? RELAY_DEFAULTS.hostReclaimMs,
    maxPlayersCap: RELAY_DEFAULTS.maxPlayersCap,
  });

  const server = createHttpServer();
  const wss = new WebSocketServer({
    server,
    maxPayload: opts.maxPayloadBytes ?? RELAY_DEFAULTS.maxPayloadBytes,
  });
  const heartbeat = startHeartbeat(wss, pingIntervalMs, maxMissedPings);

  wss.on('connection', (ws) => {
    const session = rooms.newSession({
      sendRaw: (json) => {
        if (ws.readyState === ws.OPEN) ws.send(json);
      },
      close: (code, reason) => ws.close(code, reason),
    });
    ws.on('message', (data) => rooms.handleRaw(session, rawToString(data)));
    ws.on('close', () => rooms.handleClose(session));
    // ws closes the socket itself on protocol errors (e.g. 1009 over maxPayload).
    ws.on('error', () => {});
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? RELAY_DEFAULTS.port, opts.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const port = (server.address() as AddressInfo).port;

  let closing: Promise<void> | null = null;
  return {
    port,
    close() {
      closing ??= new Promise<void>((resolve) => {
        heartbeat.stop();
        rooms.dispose();
        for (const ws of wss.clients) ws.terminate();
        wss.close(() => server.close(() => resolve()));
        server.closeAllConnections();
      });
      return closing;
    },
  };
}

function rawToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}
