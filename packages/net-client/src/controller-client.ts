// Phone side of the relay (SPEC §7.1): join with player key + stored reconnect token,
// reconnect with backoff, stop for good on kick / dead room.
import { RelayError } from './api';
import type { ConnectionStatus, ControllerClient, ControllerClientOptions } from './api';
import { Connection, Emitter } from './connection';
import { defaultStorage, getPlayerKeyImpl, safeGet, safeRemove, safeSet } from './player-key';
import type { ErrorMsg, PlayerId, RelayErrorCode, RelayToClient } from './protocol';

export function reconnectTokenStorageKey(game: string, code: string): string {
  return `pcg:token:${game}:${code}`;
}

/** Errors after which rejoining can't succeed: stop instead of reconnecting. */
const FATAL: ReadonlySet<RelayErrorCode> = new Set<RelayErrorCode>([
  'no-room',
  'room-closed',
  'room-full',
  'room-locked',
]);

export function createControllerClientImpl(opts: ControllerClientOptions): ControllerClient {
  const session = opts.sessionStorage ?? defaultStorage('sessionStorage');
  const tokenKey = reconnectTokenStorageKey(opts.game, opts.code);
  let playerKey: string | null = opts.playerKey ?? null;
  let token: string | null = null;
  let playerId: PlayerId | null = null;
  let hostStatus: 'present' | 'away' = 'present';
  let pending: { resolve: (v: { playerId: PlayerId }) => void; reject: (e: Error) => void } | null =
    null;
  let started: Promise<{ playerId: PlayerId }> | null = null;

  const messages = new Emitter<[unknown]>();
  const hostEvents = new Emitter<['present' | 'away']>();
  const kickedEvents = new Emitter<[]>();
  const errors = new Emitter<[RelayError]>();

  const conn = new Connection({
    url: opts.url,
    WebSocket: opts.WebSocket ?? globalThis.WebSocket,
    document: opts.document ?? (typeof document === 'undefined' ? undefined : document),
    window: opts.window ?? (typeof window === 'undefined' ? undefined : window),
    onOpen: handshake,
    onMessage,
  });

  function handshake(): void {
    playerKey ??= getPlayerKeyImpl(opts.code, opts.localStorage, opts.game);
    token ??= safeGet(session, tokenKey);
    conn.send({
      t: 'join',
      game: opts.game,
      code: opts.code,
      playerKey,
      ...(token ? { token } : {}),
    });
  }

  function onMessage(msg: RelayToClient): void {
    switch (msg.t) {
      case 'joined':
        playerId = msg.playerId;
        token = msg.token;
        safeSet(session, tokenKey, msg.token);
        conn.ready();
        pending?.resolve({ playerId: msg.playerId });
        pending = null;
        break;
      case 'msg':
        messages.emit(msg.data);
        break;
      case 'host':
        setHostStatus(msg.status === 'away' ? 'away' : 'present');
        break;
      case 'kicked':
        forgetToken();
        conn.stop('kicked');
        pending?.reject(new Error('kicked'));
        pending = null;
        kickedEvents.emit();
        break;
      case 'error':
        onRelayError(msg);
        break;
      default:
        break; // host-only messages
    }
  }

  function onRelayError(msg: ErrorMsg): void {
    const err = new RelayError(msg.code, msg.message);
    if (FATAL.has(msg.code) || conn.status !== 'open') {
      if (msg.code === 'no-room' || msg.code === 'room-closed') forgetToken();
      conn.stop(msg.code);
      pending?.reject(err);
      pending = null;
    }
    errors.emit(err);
  }

  function forgetToken(): void {
    token = null;
    safeRemove(session, tokenKey);
  }

  function setHostStatus(status: 'present' | 'away'): void {
    if (hostStatus === status) return;
    hostStatus = status;
    hostEvents.emit(status);
  }

  return {
    get status(): ConnectionStatus {
      return conn.status;
    },
    get playerId() {
      return playerId;
    },
    get hostStatus() {
      return hostStatus;
    },
    get closeReason() {
      return conn.closeReason;
    },
    connect() {
      if (started) return started;
      started = new Promise((resolve, reject) => {
        pending = { resolve, reject };
      });
      conn.start();
      return started;
    },
    send(data) {
      conn.send({ t: 'send', data });
    },
    close() {
      conn.stop('closed');
      pending?.reject(new Error('controller client closed'));
      pending = null;
    },
    onMessage: (cb) => messages.on(cb),
    onStatus: (cb) => conn.statusEvents.on(cb),
    onHostStatus: (cb) => hostEvents.on(cb),
    onKicked: (cb) => kickedEvents.on(cb),
    onError: (cb) => errors.on(cb),
  };
}
