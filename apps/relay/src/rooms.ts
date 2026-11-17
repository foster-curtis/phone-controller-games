// Rooms, admission, forwarding, reconnect windows. Transport-agnostic: sockets are `Peer`s.
import {
  HOST_SENDER,
  type ClientToRelay,
  type PeerEvent,
  type PlayerId,
  type RelayErrorCode,
  type RelayToClient,
  type RoomCode,
  type RosterEntry,
} from '@pcg/net-client';
import { generateCode, generateToken } from './codes';
import type { RelayLogEvent } from './index';

export interface Peer {
  /** Sends a pre-serialized JSON frame. */
  sendRaw(json: string): void;
  close(code: number, reason: string): void;
}

export interface RoomsConfig {
  playerReconnectMs: number;
  hostReclaimMs: number;
  maxPlayersCap: number;
  /** Connection log sink (relay SPEC §3.1); `at` is stamped here. */
  log?: (event: RelayLogEvent) => void;
}

interface Player {
  playerId: PlayerId;
  playerKey: string;
  token: string;
  session: Session | null;
  /** Socket number of the last session (for `player-expired`). */
  conn: number;
  /** Reconnect-window timer while disconnected. */
  timer: ReturnType<typeof setTimeout> | null;
}

interface Room {
  game: string;
  code: RoomCode;
  maxPlayers: number;
  locked: boolean;
  hostToken: string;
  host: Session | null;
  /** Socket number of the last host session (for `room-closed`). */
  hostConn: number;
  hostTimer: ReturnType<typeof setTimeout> | null;
  players: Map<PlayerId, Player>;
  nextPlayerNum: number;
}

/** Per-socket state. The role is fixed by the first successful create/reclaim/join. */
export interface Session {
  peer: Peer;
  /** Per-process socket number, for the connection log. */
  conn: number;
  role: 'none' | 'host' | 'phone';
  room: Room | null;
  player: Player | null;
}

export const CLOSE_NORMAL = 1000;

const roomKey = (game: string, code: string) => `${game}\u0000${code}`;

function send(session: Session | null, msg: RelayToClient) {
  session?.peer.sendRaw(JSON.stringify(msg));
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Parses + validates one inbound frame; null = bad-request. */
export function parseClientMessage(raw: string): ClientToRelay | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  switch (m.t) {
    case 'create':
      if (!isStr(m.game) || typeof m.maxPlayers !== 'number' || !Number.isFinite(m.maxPlayers)) {
        return null;
      }
      return { t: 'create', game: m.game, maxPlayers: m.maxPlayers };
    case 'reclaim':
      return isStr(m.hostToken) ? { t: 'reclaim', hostToken: m.hostToken } : null;
    case 'join':
      if (!isStr(m.game) || !isStr(m.code) || !isStr(m.playerKey)) return null;
      if (m.token !== undefined && typeof m.token !== 'string') return null;
      return {
        t: 'join',
        game: m.game,
        code: m.code.toUpperCase(),
        playerKey: m.playerKey,
        ...(isStr(m.token) ? { token: m.token } : {}),
      };
    case 'send':
      if (m.to !== undefined && typeof m.to !== 'string') return null;
      return { t: 'send', ...(m.to !== undefined ? { to: m.to } : {}), data: m.data };
    case 'lock':
      return { t: 'lock' };
    case 'unlock':
      return { t: 'unlock' };
    case 'kick':
      return isStr(m.playerId) ? { t: 'kick', playerId: m.playerId } : null;
    case 'ping':
      return typeof m.n === 'number' && Number.isFinite(m.n) ? { t: 'ping', n: m.n } : null;
    default:
      return null;
  }
}

export class Rooms {
  private rooms = new Map<string, Room>();
  private byHostToken = new Map<string, Room>();
  private disposed = false;

  constructor(private readonly cfg: RoomsConfig) {}

  get size() {
    return this.rooms.size;
  }

  newSession(peer: Peer, conn = 0): Session {
    return { peer, conn, role: 'none', room: null, player: null };
  }

  /** Room context of a socket, for its `close` log line (read before `handleClose`). */
  describe(s: Session): Pick<RelayLogEvent, 'role' | 'game' | 'code' | 'playerId'> {
    return {
      role: s.role,
      ...(s.room ? { game: s.room.game, code: s.room.code } : {}),
      ...(s.player ? { playerId: s.player.playerId } : {}),
    };
  }

  private log(kind: RelayLogEvent['kind'], s: Session | null, extra: Partial<RelayLogEvent> = {}) {
    if (!this.cfg.log) return;
    this.cfg.log({
      at: Date.now(),
      kind,
      conn: s?.conn ?? 0,
      ...(s ? this.describe(s) : {}),
      ...extra,
    });
  }

  private error(session: Session, code: RelayErrorCode, message?: string) {
    this.log('error', session, { errorCode: code });
    send(session, message ? { t: 'error', code, message } : { t: 'error', code });
  }

  handleRaw(s: Session, raw: string) {
    const msg = parseClientMessage(raw);
    if (!msg) return this.error(s, 'bad-request', 'malformed or unknown message');
    this.handle(s, msg);
  }

  handle(s: Session, msg: ClientToRelay) {
    const wrongRole = () =>
      this.error(s, 'bad-request', `"${msg.t}" not allowed for role ${s.role}`);
    switch (msg.t) {
      case 'ping':
        // Any socket, any state: answered to this socket alone (decision #5).
        return send(s, { t: 'pong', n: msg.n });
      case 'create':
        return s.role === 'none' ? this.create(s, msg.game, msg.maxPlayers) : wrongRole();
      case 'reclaim':
        return s.role === 'none' ? this.reclaim(s, msg.hostToken) : wrongRole();
      case 'join':
        return s.role === 'none' ? this.join(s, msg) : wrongRole();
      case 'send':
        if (s.role === 'host') return this.hostSend(s, msg.to, msg.data);
        if (s.role === 'phone') return this.phoneSend(s, msg.data);
        return wrongRole();
      case 'lock':
      case 'unlock':
        if (s.role !== 'host' || !s.room) return wrongRole();
        s.room.locked = msg.t === 'lock';
        return;
      case 'kick':
        return s.role === 'host' ? this.kick(s, msg.playerId) : wrongRole();
    }
  }

  private create(s: Session, game: string, maxPlayers: number) {
    const code = generateCode((c) => this.rooms.has(roomKey(game, c)));
    const room: Room = {
      game,
      code,
      maxPlayers: Math.min(this.cfg.maxPlayersCap, Math.max(1, Math.floor(maxPlayers))),
      locked: false,
      hostToken: generateToken(),
      host: s,
      hostConn: s.conn,
      hostTimer: null,
      players: new Map(),
      nextPlayerNum: 1,
    };
    this.rooms.set(roomKey(game, code), room);
    this.byHostToken.set(room.hostToken, room);
    s.role = 'host';
    s.room = room;
    send(s, { t: 'created', code, hostToken: room.hostToken, heartbeat: true });
    this.log('create', s);
  }

  private reclaim(s: Session, hostToken: string) {
    const room = this.byHostToken.get(hostToken);
    if (!room) return this.error(s, 'no-room');
    const wasAway = room.host === null;
    const takeover = room.host !== null;
    if (room.host) {
      // Takeover: the old host socket hasn't been detected dead yet.
      const old = room.host;
      old.room = null;
      old.peer.close(CLOSE_NORMAL, 'host reclaimed elsewhere');
    }
    if (room.hostTimer) clearTimeout(room.hostTimer);
    room.hostTimer = null;
    room.host = s;
    room.hostConn = s.conn;
    s.role = 'host';
    s.room = room;
    const roster: RosterEntry[] = [...room.players.values()].map((p) => ({
      playerId: p.playerId,
      playerKey: p.playerKey,
      connected: p.session !== null,
    }));
    send(s, { t: 'reclaimed', code: room.code, roster, heartbeat: true });
    this.log('reclaim', s, { takeover });
    if (wasAway) this.toPhones(room, { t: 'host', status: 'back' });
  }

  private join(s: Session, msg: Extract<ClientToRelay, { t: 'join' }>) {
    const room = this.rooms.get(roomKey(msg.game, msg.code));
    if (!room) return this.error(s, 'no-room');

    const existing = msg.token
      ? [...room.players.values()].find((p) => p.token === msg.token)
      : undefined;
    let player: Player;
    let event: PeerEvent;
    let takeover = false;
    if (existing) {
      if (existing.session) {
        takeover = true;
        // Takeover: the old phone socket hasn't been detected dead yet.
        const old = existing.session;
        old.player = null;
        old.room = null;
        old.peer.close(CLOSE_NORMAL, 'rejoined elsewhere');
      }
      if (existing.timer) clearTimeout(existing.timer);
      existing.timer = null;
      existing.playerKey = msg.playerKey;
      player = existing;
      event = 'rejoined';
    } else {
      if (room.locked) return this.error(s, 'room-locked');
      if (room.players.size >= room.maxPlayers) return this.error(s, 'room-full');
      player = {
        playerId: `p${room.nextPlayerNum++}`,
        playerKey: msg.playerKey,
        token: generateToken(),
        session: null,
        conn: s.conn,
        timer: null,
      };
      room.players.set(player.playerId, player);
      event = 'joined';
    }
    player.session = s;
    player.conn = s.conn;
    s.role = 'phone';
    s.room = room;
    s.player = player;
    send(s, { t: 'joined', playerId: player.playerId, token: player.token, heartbeat: true });
    if (event === 'rejoined') this.log('rejoin', s, { takeover });
    else this.log('join', s);
    if (room.host) {
      send(room.host, { t: 'peer', event, playerId: player.playerId, playerKey: player.playerKey });
    } else {
      send(s, { t: 'host', status: 'away' });
    }
  }

  private hostSend(s: Session, to: PlayerId | undefined, data: unknown) {
    const room = s.room;
    if (!room) return;
    const json = JSON.stringify({ t: 'msg', from: HOST_SENDER, data } satisfies RelayToClient);
    if (to !== undefined) {
      room.players.get(to)?.session?.peer.sendRaw(json);
      return;
    }
    for (const p of room.players.values()) p.session?.peer.sendRaw(json);
  }

  private phoneSend(s: Session, data: unknown) {
    if (!s.room || !s.player) return;
    send(s.room.host, { t: 'msg', from: s.player.playerId, data });
  }

  private kick(s: Session, playerId: PlayerId) {
    const room = s.room;
    const player = room?.players.get(playerId);
    if (!room || !player) return;
    this.removePlayer(room, player);
    const ps = player.session;
    this.log('kick', s, { playerId });
    if (ps) {
      ps.player = null;
      ps.room = null;
      send(ps, { t: 'kicked' });
      ps.peer.close(CLOSE_NORMAL, 'kicked');
    }
  }

  /** Socket closed (or was dropped by the heartbeat). */
  handleClose(s: Session) {
    const room = s.room;
    s.room = null;
    if (!room || this.disposed) return;
    if (s.role === 'host' && room.host === s) {
      room.host = null;
      this.toPhones(room, { t: 'host', status: 'away' });
      room.hostTimer = setTimeout(() => this.closeRoom(room), this.cfg.hostReclaimMs);
      return;
    }
    const player = s.player;
    s.player = null;
    if (s.role === 'phone' && player && player.session === s) {
      player.session = null;
      send(room.host, {
        t: 'peer',
        event: 'left',
        playerId: player.playerId,
        playerKey: player.playerKey,
      });
      player.timer = setTimeout(() => {
        this.log('player-expired', null, {
          conn: player.conn,
          role: 'phone',
          game: room.game,
          code: room.code,
          playerId: player.playerId,
        });
        this.removePlayer(room, player);
      }, this.cfg.playerReconnectMs);
    }
  }

  private removePlayer(room: Room, player: Player) {
    if (player.timer) clearTimeout(player.timer);
    player.timer = null;
    room.players.delete(player.playerId);
  }

  private closeRoom(room: Room) {
    this.log('room-closed', null, {
      conn: room.hostConn,
      role: 'host',
      game: room.game,
      code: room.code,
    });
    this.deleteRoom(room);
    for (const p of room.players.values()) {
      const ps = p.session;
      if (!ps) continue;
      ps.player = null;
      ps.room = null;
      send(ps, { t: 'error', code: 'room-closed' });
      ps.peer.close(CLOSE_NORMAL, 'room closed');
    }
  }

  private deleteRoom(room: Room) {
    if (room.hostTimer) clearTimeout(room.hostTimer);
    room.hostTimer = null;
    for (const p of room.players.values()) {
      if (p.timer) clearTimeout(p.timer);
      p.timer = null;
    }
    this.rooms.delete(roomKey(room.game, room.code));
    this.byHostToken.delete(room.hostToken);
  }

  private toPhones(room: Room, msg: RelayToClient) {
    const json = JSON.stringify(msg);
    for (const p of room.players.values()) p.session?.peer.sendRaw(json);
  }

  /** Clears every timer and forgets all rooms (relay shutdown). */
  dispose() {
    this.disposed = true;
    for (const room of [...this.rooms.values()]) this.deleteRoom(room);
  }
}
