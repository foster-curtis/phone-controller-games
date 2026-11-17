// Relay wire protocol (relay SPEC §3). Frozen at F0: additive changes only.
// Game-agnostic: `data` payloads are opaque to the relay and to this package.

/** Room codes: 4 letters from an unambiguous alphabet (no I or O; letters only, so no 0 or 1). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;

export type RoomCode = string;
export type PlayerId = string;

/** `from` on messages the host sends to phones (relay-stamped; real player ids never equal it). */
export const HOST_SENDER = 'host';

export type RelayErrorCode =
  'room-full' | 'no-room' | 'room-locked' | 'room-closed' | 'bad-request';

export type PeerEvent = 'joined' | 'left' | 'rejoined';

/** A phone in the room, as the host sees it after `reclaim`. */
export interface RosterEntry {
  playerId: PlayerId;
  playerKey: string;
  /** false while the phone is inside its reconnect window. */
  connected: boolean;
}

// client → relay
export type CreateMsg = { t: 'create'; game: string; maxPlayers: number };
export type ReclaimMsg = { t: 'reclaim'; hostToken: string };
export type JoinMsg = {
  t: 'join';
  game: string;
  code: RoomCode;
  playerKey: string;
  token?: string;
};
/** Host: `to` targets one phone, omitted = broadcast. Phone: `to` is ignored (always the host). */
export type SendMsg = { t: 'send'; to?: PlayerId; data: unknown };
export type LockMsg = { t: 'lock' };
export type UnlockMsg = { t: 'unlock' };
export type KickMsg = { t: 'kick'; playerId: PlayerId };

/**
 * App-level heartbeat (relay SPEC §3, liveness; added at F0 of controller-compat). Any socket, in any
 * state, may send it; the relay answers that socket alone with a `pong` echoing `n`. Clients send it
 * only after the handshake reply advertised `heartbeat: true`, so they never send it to an older relay.
 */
export type PingMsg = { t: 'ping'; n: number };

export type ClientToRelay =
  CreateMsg | ReclaimMsg | JoinMsg | SendMsg | LockMsg | UnlockMsg | KickMsg | PingMsg;

/**
 * Handshake replies carry `heartbeat: true` from relays that answer `ping` (added at F0 of
 * controller-compat). Absent = an older relay: clients must not send `ping`.
 */
export interface HeartbeatFlag {
  heartbeat?: true;
}

// relay → client
export type CreatedMsg = { t: 'created'; code: RoomCode; hostToken: string } & HeartbeatFlag;
export type ReclaimedMsg = {
  t: 'reclaimed';
  code: RoomCode;
  roster: RosterEntry[];
} & HeartbeatFlag;
export type JoinedMsg = { t: 'joined'; playerId: PlayerId; token: string } & HeartbeatFlag;
/** Answer to `ping`, to the pinging socket only. */
export type PongMsg = { t: 'pong'; n: number };
export type PeerMsg = { t: 'peer'; event: PeerEvent; playerId: PlayerId; playerKey: string };
/** `from` is the sender's playerId (to the host) or `HOST_SENDER` (to phones). */
export type RelayDataMsg = { t: 'msg'; from: PlayerId; data: unknown };
/** To phones: the host socket dropped (`away`) or the host reclaimed the room (`back`). */
export type HostStatusMsg = { t: 'host'; status: 'away' | 'back' };
export type KickedMsg = { t: 'kicked' };
export type ErrorMsg = { t: 'error'; code: RelayErrorCode; message?: string };

export type RelayToClient =
  | CreatedMsg
  | ReclaimedMsg
  | JoinedMsg
  | PeerMsg
  | RelayDataMsg
  | HostStatusMsg
  | KickedMsg
  | ErrorMsg
  | PongMsg;
