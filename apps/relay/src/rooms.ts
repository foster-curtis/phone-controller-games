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

export interface Peer {
  /** Sends a pre-serialized JSON frame. */
  sendRaw(json: string): void;
  close(code: number, reason: string): void;
}

export interface RoomsConfig {
  playerReconnectMs: number;
  hostReclaimMs: number;
  maxPlayersCap: number;
}

interface Player {
  playerId: PlayerId;
  playerKey: string;
  token: string;
  session: Session | null;
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
  hostTimer: ReturnType<typeof setTimeout> | null;
  players: Map<PlayerId, Player>;
  nextPlayerNum: number;
}

/** Per-socket state. The role is fixed by the first successful create/reclaim/join. */
export interface Session {
  peer: Peer;
  role: 'none' | 'host' | 'phone';
  room: Room | null;
  player: Player | null;
}

export const CLOSE_NORMAL = 1000;

const roomKey = (game: string, code: string) => `${game}\u0000${code}`;

function send(session: Session | null, msg: RelayToClient) {
  session?.peer.sendRaw(JSON.stringify(msg));
}

function error(session: Session, code: RelayErrorCode, message?: string) {
  send(session, message ? { t: 'error', code, message } : { t: 'error', code });
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

  newSession(peer: Peer): Session {
    return { peer, role: 'none', room: null, player: null };
  }

  handleRaw(s: Session, raw: string) {
    const msg = parseClientMessage(raw);
    if (!msg) return error(s, 'bad-request', 'malformed or unknown message');
    this.handle(s, msg);
  }

  handle(s: Session, msg: ClientToRelay) {
    const wrongRole = () => error(s, 'bad-request', `"${msg.t}" not allowed for role ${s.role}`);
    switch (msg.t) {
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
      hostTimer: null,
      players: new Map(),
      nextPlayerNum: 1,
    };
    this.rooms.set(roomKey(game, code), room);
    this.byHostToken.set(room.hostToken, room);
    s.role = 'host';
    s.room = room;
    send(s, { t: 'created', code, hostToken: room.hostToken });
  }

  private reclaim(s: Session, hostToken: string) {
    const room = this.byHostToken.get(hostToken);
    if (!room) return error(s, 'no-room');
    const wasAway = room.host === null;
    if (room.host) {
      // Takeover: the old host socket hasn't been detected dead yet.
      const old = room.host;
      old.room = null;
      old.peer.close(CLOSE_NORMAL, 'host reclaimed elsewhere');
    }
    if (room.hostTimer) clearTimeout(room.hostTimer);
    room.hostTimer = null;
    room.host = s;
    s.role = 'host';
    s.room = room;
    const roster: RosterEntry[] = [...room.players.values()].map((p) => ({
      playerId: p.playerId,
      playerKey: p.playerKey,
      connected: p.session !== null,
    }));
    send(s, { t: 'reclaimed', code: room.code, roster });
    if (wasAway) this.toPhones(room, { t: 'host', status: 'back' });
  }

  private join(s: Session, msg: Extract<ClientToRelay, { t: 'join' }>) {
    const room = this.rooms.get(roomKey(msg.game, msg.code));
    if (!room) return error(s, 'no-room');

    const existing = msg.token
      ? [...room.players.values()].find((p) => p.token === msg.token)
      : undefined;
    let player: Player;
    let event: PeerEvent;
    if (existing) {
      if (existing.session) {
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
      if (room.locked) return error(s, 'room-locked');
      if (room.players.size >= room.maxPlayers) return error(s, 'room-full');
      player = {
        playerId: `p${room.nextPlayerNum++}`,
        playerKey: msg.playerKey,
        token: generateToken(),
        session: null,
        timer: null,
      };
      room.players.set(player.playerId, player);
      event = 'joined';
    }
    player.session = s;
    s.role = 'phone';
    s.room = room;
    s.player = player;
    send(s, { t: 'joined', playerId: player.playerId, token: player.token });
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
      player.timer = setTimeout(() => this.removePlayer(room, player), this.cfg.playerReconnectMs);
    }
  }

  private removePlayer(room: Room, player: Player) {
    if (player.timer) clearTimeout(player.timer);
    player.timer = null;
    room.players.delete(player.playerId);
  }

  private closeRoom(room: Room) {
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
