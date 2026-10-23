// Host (TV) side of the relay (SPEC §7.1): create or reclaim a room, then route messages.
import { RelayError } from './api';
import type { ConnectionStatus, HostClient, HostClientOptions, HostRoom, PeerChange } from './api';
import { Connection, Emitter } from './connection';
import { defaultStorage, safeGet, safeRemove, safeSet } from './player-key';
import type { ErrorMsg, PlayerId, RelayToClient, RoomCode } from './protocol';

export function hostTokenStorageKey(game: string): string {
  return `pcg:hostToken:${game}`;
}

export function createHostClientImpl(opts: HostClientOptions): HostClient {
  const session = opts.sessionStorage ?? defaultStorage('sessionStorage');
  const tokenKey = hostTokenStorageKey(opts.game);
  let hostToken: string | null = null;
  let code: RoomCode | null = null;
  let pending: { resolve: (room: HostRoom) => void; reject: (err: Error) => void } | null = null;
  let started: Promise<HostRoom> | null = null;

  const messages = new Emitter<[PlayerId, unknown]>();
  const peers = new Emitter<[PeerChange]>();
  const rooms = new Emitter<[HostRoom]>();
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
    hostToken ??= safeGet(session, tokenKey);
    if (hostToken) conn.send({ t: 'reclaim', hostToken });
    else conn.send({ t: 'create', game: opts.game, maxPlayers: opts.maxPlayers });
  }

  function onMessage(msg: RelayToClient): void {
    switch (msg.t) {
      case 'created':
        hostToken = msg.hostToken;
        safeSet(session, tokenKey, msg.hostToken);
        enterRoom({ code: msg.code, reclaimed: false, roster: [] });
        break;
      case 'reclaimed':
        enterRoom({ code: msg.code, reclaimed: true, roster: msg.roster });
        break;
      case 'peer':
        peers.emit({ event: msg.event, playerId: msg.playerId, playerKey: msg.playerKey });
        break;
      case 'msg':
        messages.emit(msg.from, msg.data);
        break;
      case 'error':
        onRelayError(msg);
        break;
      default:
        break; // phone-only messages
    }
  }

  function enterRoom(room: HostRoom): void {
    code = room.code;
    conn.ready();
    rooms.emit(room);
    pending?.resolve(room);
    pending = null;
  }

  function onRelayError(msg: ErrorMsg): void {
    const err = new RelayError(msg.code, msg.message);
    const handshaking = conn.status !== 'open';
    if (handshaking && hostToken && (msg.code === 'no-room' || msg.code === 'room-closed')) {
      // The room to reclaim is gone (window expired): start a fresh one. If the relay
      // closed this socket, the reconnect path creates instead (no token any more).
      hostToken = null;
      safeRemove(session, tokenKey);
      conn.send({ t: 'create', game: opts.game, maxPlayers: opts.maxPlayers });
      return;
    }
    if (handshaking) {
      conn.stop(msg.code);
      pending?.reject(err);
      pending = null;
    }
    errors.emit(err);
  }

  return {
    get status(): ConnectionStatus {
      return conn.status;
    },
    get code() {
      return code;
    },
    get closeReason() {
      return conn.closeReason;
    },
    start() {
      if (started) return started;
      started = new Promise<HostRoom>((resolve, reject) => {
        pending = { resolve, reject };
      });
      conn.start();
      return started;
    },
    send(data, to) {
      conn.send(to === undefined ? { t: 'send', data } : { t: 'send', to, data });
    },
    lock() {
      conn.send({ t: 'lock' });
    },
    unlock() {
      conn.send({ t: 'unlock' });
    },
    kick(playerId) {
      conn.send({ t: 'kick', playerId });
    },
    close() {
      // The host token is kept on purpose so a page reload can still reclaim the room.
      conn.stop('closed');
      pending?.reject(new Error('host client closed'));
      pending = null;
    },
    onMessage: (cb) => messages.on(cb),
    onPeer: (cb) => peers.on(cb),
    onRoom: (cb) => rooms.on(cb),
    onStatus: (cb) => conn.statusEvents.on(cb),
    onError: (cb) => errors.on(cb),
  };
}
