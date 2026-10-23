// Game-agnostic WebSocket relay. Frozen at F0 (createRelay / RelayOptions); M1 implements it.

export interface RelayOptions {
  /** TCP port; 0 = ephemeral (tests). Default 8787. */
  port?: number;
  /** Bind address. Default: all interfaces. */
  host?: string;
  /** Phone reconnect window. Default 30 000. */
  playerReconnectMs?: number;
  /** Host reclaim window. Default 60 000. */
  hostReclaimMs?: number;
  /** Heartbeat interval. Default 5 000. */
  pingIntervalMs?: number;
  /** Drop a socket after this many unanswered pings. Default 2. */
  maxMissedPings?: number;
  /** Max inbound message size in bytes. Default 16 KB. */
  maxPayloadBytes?: number;
}

export interface Relay {
  /** The bound port (useful with `port: 0`). */
  port: number;
  close(): Promise<void>;
}

export const RELAY_DEFAULTS = {
  port: 8787,
  playerReconnectMs: 30_000,
  hostReclaimMs: 60_000,
  pingIntervalMs: 5_000,
  maxMissedPings: 2,
  maxPayloadBytes: 16 * 1024,
  /** `create.maxPlayers` is clamped to 1..maxPlayersCap. */
  maxPlayersCap: 16,
} as const;

export function createRelay(_opts: RelayOptions = {}): Promise<Relay> {
  throw new Error('createRelay: not implemented (M1)');
}
