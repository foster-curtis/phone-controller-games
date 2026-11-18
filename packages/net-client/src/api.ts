// Host and controller clients. Frozen at F0 (signatures); M2 implements the bodies.
import { createControllerClientImpl } from './controller-client';
import { createHostClientImpl } from './host-client';
import { getPlayerKeyImpl } from './player-key';
import type { PeerEvent, PlayerId, RelayErrorCode, RoomCode, RosterEntry } from './protocol';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export type Unsubscribe = () => void;

/** Why a client reached `closed`: a fatal relay error, `kicked`, or `closed` (local `close()`). */
export type CloseReason = RelayErrorCode | 'kicked' | 'closed';

/** WebSocket constructor: the browser global, Node 22+ global, or a test fake. */
export type WebSocketCtor = new (url: string) => WebSocket;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Lets a client reconnect promptly when a backgrounded tab becomes visible again. */
export type DocumentLike = Pick<
  Document,
  'visibilityState' | 'addEventListener' | 'removeEventListener'
>;

/** Receives the `online` event (normally `window`). */
export type EventTargetLike = Pick<Window, 'addEventListener' | 'removeEventListener'>;

// ---- connection health (added at F0 of controller-compat; relay SPEC §3.1) ----

/**
 * Dead-socket detection. App pings run only when the relay's handshake reply said
 * `heartbeat: true`; the connect timeout always applies. Every value in ms.
 */
export interface HeartbeatOptions {
  /** Ping interval while open. Default 5 000. 0 turns app pings (and the watchdog) off. */
  intervalMs?: number;
  /**
   * A ping unanswered for this long, with no other frame received since it was sent, means the
   * socket is dead: close it and reconnect. Measured from the ping, never from the last frame, so a
   * throttled background tab can't trip it. Default 12 000.
   */
  timeoutMs?: number;
  /**
   * After the page comes back (visible, `pageshow`, `online`, `resume`, `focus`) on an open socket,
   * a probe ping is sent; no frame within this long → reconnect at once. Default 3 000.
   */
  probeTimeoutMs?: number;
  /** A socket that hasn't finished its handshake this long after `new WebSocket` is retried. Default 8 000. */
  connectTimeoutMs?: number;
}

export const HEARTBEAT_DEFAULTS: Readonly<Required<HeartbeatOptions>> = {
  intervalMs: 5_000,
  timeoutMs: 12_000,
  probeTimeoutMs: 3_000,
  connectTimeoutMs: 8_000,
};

/**
 * Why the last socket ended: `socket` (the browser fired `close`), `heartbeat-timeout`,
 * `probe-timeout`, `connect-timeout` (the client gave up on it), or `local` (`close()` / a fatal
 * relay error / kick).
 */
export type CloseCause =
  'socket' | 'heartbeat-timeout' | 'probe-timeout' | 'connect-timeout' | 'local';

export interface LastClose {
  cause: CloseCause;
  /** WebSocket close code (1006 for an abnormal drop; 0 when the client dropped it itself). */
  code: number;
  reason: string;
  wasClean: boolean;
  /** `Date.now()` when it happened. */
  at: number;
}

/** A snapshot for diagnostics (the phone's `?debug=1` overlay) and tests. */
export interface ConnectionStats {
  status: ConnectionStatus;
  /** Handshakes completed after the first one (each successful reconnect). */
  reconnects: number;
  /** Sockets opened that never completed a handshake, plus sockets that failed to construct. */
  failedAttempts: number;
  lastClose: LastClose | null;
  /** Last app ping round trip; null before the first pong or against a relay without heartbeat. */
  rttMs: number | null;
  /** The relay advertised `heartbeat: true` on the current (or last) handshake. */
  heartbeat: boolean;
  /** `Date.now()` of the last frame received, or null. */
  lastMessageAt: number | null;
  /** `Date.now()` when the current socket completed its handshake, or null while not open. */
  openSince: number | null;
}

/** Injectable environment; every field defaults to the browser global. */
export interface ClientEnv {
  WebSocket?: WebSocketCtor;
  /** Default `sessionStorage` (reconnect token, host token). */
  sessionStorage?: StorageLike;
  /** Default `localStorage` (player key). */
  localStorage?: StorageLike;
  /** Default `document` when present; absent = no visibility handling. */
  document?: DocumentLike;
  /**
   * Default `window` when present; its `online`, `pageshow` and `focus` events trigger an immediate
   * reconnect attempt (or a probe ping on an open socket).
   */
  window?: EventTargetLike;
  /** Heartbeat and timeout tuning (added at F0 of controller-compat). Defaults: HEARTBEAT_DEFAULTS. */
  heartbeat?: HeartbeatOptions;
  /** Clock for stats and timeouts (tests). Default `Date.now`. */
  now?: () => number;
}

export class RelayError extends Error {
  readonly code: RelayErrorCode;
  constructor(code: RelayErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'RelayError';
    this.code = code;
  }
}

// ---- host ----

export interface HostClientOptions extends ClientEnv {
  /** Relay WebSocket URL. */
  url: string;
  game: string;
  maxPlayers: number;
}

export interface HostRoom {
  code: RoomCode;
  /** true when an existing room was reclaimed (host refresh or socket drop). */
  reclaimed: boolean;
  /** Phones already in the room (empty for a new room). */
  roster: RosterEntry[];
}

export interface PeerChange {
  event: PeerEvent;
  playerId: PlayerId;
  playerKey: string;
}

export interface HostClient {
  readonly status: ConnectionStatus;
  readonly code: RoomCode | null;
  /** Set once status is `closed`. */
  readonly closeReason: CloseReason | null;
  /** Reclaims the room whose host token is in sessionStorage, else creates one. Rejects with RelayError. */
  start(): Promise<HostRoom>;
  /** `to` omitted = broadcast to every phone. */
  send(data: unknown, to?: PlayerId): void;
  lock(): void;
  unlock(): void;
  kick(playerId: PlayerId): void;
  /** Closes the socket for good (no reconnect). */
  close(): void;
  onMessage(cb: (from: PlayerId, data: unknown) => void): Unsubscribe;
  onPeer(cb: (change: PeerChange) => void): Unsubscribe;
  /** Fires on every create/reclaim, including after an automatic reconnect. */
  onRoom(cb: (room: HostRoom) => void): Unsubscribe;
  onStatus(cb: (status: ConnectionStatus) => void): Unsubscribe;
  onError(cb: (error: RelayError) => void): Unsubscribe;
  /** Connection health snapshot (added at F0 of controller-compat). */
  getStats(): ConnectionStats;
}

export function createHostClient(opts: HostClientOptions): HostClient {
  return createHostClientImpl(opts);
}

// ---- controller ----

export interface ControllerClientOptions extends ClientEnv {
  url: string;
  game: string;
  code: RoomCode;
  /** Default `getPlayerKey(code, localStorage, game)`. */
  playerKey?: string;
}

export interface ControllerClient {
  readonly status: ConnectionStatus;
  readonly playerId: PlayerId | null;
  readonly hostStatus: 'present' | 'away';
  /** Set once status is `closed` (`kicked`, `no-room`, `room-closed`, ...). */
  readonly closeReason: CloseReason | null;
  /** Joins (or rejoins with the stored token). Rejects with RelayError (`no-room`, `room-full`, ...). */
  connect(): Promise<{ playerId: PlayerId }>;
  /** To the host. Dropped while not open. */
  send(data: unknown): void;
  /** Closes the socket for good (no reconnect). */
  close(): void;
  onMessage(cb: (data: unknown) => void): Unsubscribe;
  onStatus(cb: (status: ConnectionStatus) => void): Unsubscribe;
  onHostStatus(cb: (status: 'present' | 'away') => void): Unsubscribe;
  onKicked(cb: () => void): Unsubscribe;
  onError(cb: (error: RelayError) => void): Unsubscribe;
  /** Connection health snapshot (added at F0 of controller-compat). */
  getStats(): ConnectionStats;
}

export function createControllerClient(opts: ControllerClientOptions): ControllerClient {
  return createControllerClientImpl(opts);
}

/**
 * The phone's player key for this room code (and game, when given): read from, or generated
 * into, localStorage. Stable per (game, code); a new key per code.
 */
export function getPlayerKey(code: RoomCode, storage?: StorageLike, game?: string): string {
  return getPlayerKeyImpl(code, storage, game);
}
