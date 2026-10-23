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

/** Injectable environment; every field defaults to the browser global. */
export interface ClientEnv {
  WebSocket?: WebSocketCtor;
  /** Default `sessionStorage` (reconnect token, host token). */
  sessionStorage?: StorageLike;
  /** Default `localStorage` (player key). */
  localStorage?: StorageLike;
  /** Default `document` when present; absent = no visibility handling. */
  document?: DocumentLike;
  /** Default `window` when present; its `online` event triggers an immediate reconnect attempt. */
  window?: EventTargetLike;
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
