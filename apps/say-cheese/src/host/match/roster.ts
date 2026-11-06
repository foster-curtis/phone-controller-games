// Roster (SPEC §6.3, §6.3.1): seats (players) and the phones that hold them. Ready, camera and the
// connection belong to the phone and are mirrored on each of its seats.
import {
  MAX_SEATS,
  PLAYER_COLOR_IDS,
  type CameraStatus,
  type PlayerSummary,
} from '../../shared/messages';
import { hasRoom, pickColor, seatId, seatsOf, type SeatId } from '../../shared/seats';
import type { MatchState, Player } from './types';

/** What the host knows about a controller, seats or not. */
export interface Phone {
  id: string;
  connected: boolean;
  camera: CameraStatus;
  ready: boolean;
  /** Relay `playerKey`: seat 0's late-rejoin key. */
  playerKey: string;
  /** Sent Leave game: shows the left screen until it adds a player again. */
  left: boolean;
}

export type Phones = Map<string, Phone>;

export function ensurePhone(phones: Phones, id: string): Phone {
  let p = phones.get(id);
  if (!p) {
    p = { id, connected: true, camera: 'unknown', ready: false, playerKey: '', left: false };
    phones.set(id, p);
  }
  return p;
}

/** Seats not removed (spectators included). */
export const active = (s: MatchState): Player[] => s.players.filter((p) => !p.left);
/** Seats in this match: not removed, not spectating. */
export const playing = (s: MatchState): Player[] => active(s).filter((p) => !p.spectator);

export function findPlayer(s: MatchState, id: string): Player | undefined {
  return s.players.find((p) => p.id === id && !p.left);
}

export function phoneSeats(s: MatchState, phoneId: string): Player[] {
  return seatsOf(s.players, phoneId);
}

export function summary(p: Player): PlayerSummary {
  return { playerId: p.id, name: p.name, color: p.color };
}

/** Copies the phone's connection, camera and ready onto its seats. */
export function mirror(s: MatchState, phone: Phone): void {
  for (const p of phoneSeats(s, phone.id)) {
    p.connected = phone.connected;
    p.camera = phone.camera;
    p.ready = phone.ready;
  }
}

/**
 * Adds a seat to `phone` (SPEC §6.3.1). Refused (null) at the room's 8-seat cap. Joiners outside
 * the lobby spectate until the next match (SPEC §6.3).
 */
export function addPlayer(
  s: MatchState,
  phone: Phone,
  seat: number,
  name: string,
  playerKey: string,
): Player | null {
  if (!hasRoom(s.players, MAX_SEATS)) return null;
  const color = pickColor(s.players, PLAYER_COLOR_IDS);
  if (!color) return null;
  phone.left = false;
  const p: Player = {
    id: seatId(phone.id, seat),
    phoneId: phone.id,
    seat,
    playerKey,
    name: name.trim(),
    color,
    score: 0,
    connected: phone.connected,
    camera: phone.camera,
    ready: phone.ready,
    joinIndex: s.nextJoin++,
    spectator: s.phase !== 'lobby',
    left: false,
  };
  s.players.push(p);
  return p;
}

/**
 * Leave rules (SPEC §6.3): in the lobby the seat is simply gone; mid-match it's kept, flagged
 * `left`, for the standings. Callers handle the queue and the round.
 */
export function removePlayer(s: MatchState, id: SeatId): Player | null {
  const p = findPlayer(s, id);
  if (!p) return null;
  if (s.phase === 'lobby') s.players = s.players.filter((q) => q !== p);
  else p.left = true;
  return p;
}

/** Between matches: drop removed seats, seat the spectators, zero the scores. */
export function resetForMatch(s: MatchState): void {
  s.players = active(s);
  for (const p of s.players) {
    p.spectator = false;
    p.score = 0;
  }
}
