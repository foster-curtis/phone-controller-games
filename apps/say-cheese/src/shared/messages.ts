// Game messages between phones and the host (SPEC §6.7, §7.3, §7.4, §8), carried in relay `send.data`.
// Frozen at SC0 (BUILD_PLAN §3): additive changes only. Every addition goes in SPEC §7.3 and
// BUILD_PLAN §8 Build decisions.
import { type Ack, type Chunk, isAck, isChunk } from './blob-transfer/types';
import type { SeatId } from './seats/types';

/** Relay namespace, game ID "say-cheese" (SPEC §4, §7.1). */
export const GAME_ID = 'say-cheese';

/** Relay `maxPlayers`: phones, incl. spectators (SPEC §7.1). */
export const MAX_PHONES = 10;
/** Player (seat) cap, enforced by the host (SPEC §6.1, §6.3.1). */
export const MAX_SEATS = 8;
/** Start needs this many seats (SPEC §6.1). */
export const MIN_PLAYERS = 3;
/** Name length cap (SPEC §6.3). */
export const NAME_MAX = 10;

/** Reactions (SPEC §6.6); `{ t: 'emoji', i }` indexes this. */
export const EMOJI = ['📸', '😂', '😱', '🙈', '👀'] as const;
export type EmojiIndex = 0 | 1 | 2 | 3 | 4;

/** The brand kit's 8 player colors, in brand order (`--player-<id>` in brand.css). */
export const PLAYER_COLOR_IDS = [
  'crimson',
  'cobalt',
  'jade',
  'berry',
  'bone',
  'sky',
  'lilac',
  'forest',
] as const;
export type PlayerColorId = (typeof PLAYER_COLOR_IDS)[number];

export function isPlayerColorId(v: unknown): v is PlayerColorId {
  return typeof v === 'string' && (PLAYER_COLOR_IDS as readonly string[]).includes(v);
}

// ---- phone → host ----

/** Leader actions without arguments (SPEC §6.5; `skip` and `howToPlay` from BUILD_PLAN §8). */
export const LEADER_ACTIONS = [
  'start',
  'howToPlay',
  'next',
  'skip',
  'skipReview',
  'rematch',
  'lobby',
] as const;
export type LeaderAction = (typeof LEADER_ACTIONS)[number];

/** One seat a phone holds, sent in `hello` so the host can restore extra seats on reconnect. */
export interface HelloSeat {
  seat: number;
  seatKey: string;
  name: string;
}

export type PhoneMsg =
  /** On every (re)connect: the phone's seats (seat 0's key is the relay `playerKey`). */
  | { t: 'hello'; seats: HelloSeat[] }
  /** Lobby: set a seat's name. */
  | { t: 'profile'; seat: number; name: string }
  /** Lobby: add a player on this phone (SPEC §6.3.1). */
  | { t: 'addSeat'; name: string; seatKey: string }
  /** Remove one player on this phone (Leave rules, SPEC §6.3). */
  | { t: 'removeSeat'; seat: number }
  /** "I'm {name}" on the pass screen. */
  | { t: 'seatConfirm'; seat: number }
  /** Lobby, after the permission attempt. Per phone. */
  | { t: 'camera'; ok: boolean }
  /** Lobby. Per phone. */
  | { t: 'ready'; ready: boolean }
  | { t: 'leader'; action: LeaderAction }
  /** Leader removes one seat (SPEC §6.5). */
  | { t: 'leader'; action: 'remove'; playerId: SeatId }
  /** Photographer: I'm ready (unlocks phone audio, starts scatter). */
  | { t: 'shootReady' }
  /**
   * Photographer: shutter pressed in round `r` (drives the TV flash and count). `photo` is 0-based;
   * `at` is the phone's `performance.now()`; `aspect` = width / height of the captured frame.
   */
  | { t: 'shot'; r: number; photo: number; at: number; aspect: number }
  | Chunk
  /** Photographer: shooting ended with `count` photos. */
  | { t: 'shootDone'; r: number; count: number }
  /** Review navigation. */
  | { t: 'view'; photo: number }
  /** Add or change a tag; x, y ∈ 0..1; `playerId` null = Unknown. */
  | { t: 'tag'; photo: number; tagId: string; x: number; y: number; playerId: SeatId | null }
  | { t: 'untag'; photo: number; tagId: string }
  | { t: 'finishReview' }
  | { t: 'emoji'; i: EmojiIndex }
  /** Leave game: removes every seat on this phone. */
  | { t: 'leave' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isIndex = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isSeat = (v: unknown): v is number => isIndex(v) && (v as number) < MAX_SEATS;
const isName = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && [...v].length <= NAME_MAX;
const isKey = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;
const isUnit = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 1;
const isFinitePos = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;

export function isSeatIdString(v: unknown): v is SeatId {
  return typeof v === 'string' && /^[^#]+#\d+$/.test(v) && v.length <= 64;
}

function isHelloSeat(v: unknown): v is HelloSeat {
  return isObj(v) && isSeat(v.seat) && isKey(v.seatKey) && isName(v.name);
}

/** Runtime guard for everything a phone sends (the host drops anything else). */
export function isPhoneMsg(v: unknown): v is PhoneMsg {
  if (!isObj(v)) return false;
  switch (v.t) {
    case 'hello':
      return Array.isArray(v.seats) && v.seats.length <= MAX_SEATS && v.seats.every(isHelloSeat);
    case 'profile':
      return isSeat(v.seat) && isName(v.name);
    case 'addSeat':
      return isName(v.name) && isKey(v.seatKey);
    case 'removeSeat':
    case 'seatConfirm':
      return isSeat(v.seat);
    case 'camera':
      return typeof v.ok === 'boolean';
    case 'ready':
      return typeof v.ready === 'boolean';
    case 'leader':
      if (v.action === 'remove') return isSeatIdString(v.playerId);
      return (LEADER_ACTIONS as readonly unknown[]).includes(v.action);
    case 'shootReady':
    case 'finishReview':
    case 'leave':
      return true;
    case 'shot':
      return (
        isIndex(v.r) &&
        isIndex(v.photo) &&
        typeof v.at === 'number' &&
        Number.isFinite(v.at) &&
        isFinitePos(v.aspect)
      );
    case 'chunk':
      return isChunk(v);
    case 'shootDone':
      return isIndex(v.r) && isIndex(v.count);
    case 'view':
      return isIndex(v.photo);
    case 'tag':
      return (
        isIndex(v.photo) &&
        isKey(v.tagId) &&
        isUnit(v.x) &&
        isUnit(v.y) &&
        (v.playerId === null || isSeatIdString(v.playerId))
      );
    case 'untag':
      return isIndex(v.photo) && isKey(v.tagId);
    case 'emoji':
      return Number.isInteger(v.i) && (v.i as number) >= 0 && (v.i as number) < EMOJI.length;
    default:
      return false;
  }
}

// ---- host → phone ----

/** A seat as its phone sees it. */
export interface ScreenSeat {
  seat: number;
  name: string;
  color: PlayerColorId;
}

/** A player as other phones see them (standings, tag sheet, lobby list). */
export interface PlayerSummary {
  playerId: SeatId;
  name: string;
  color: PlayerColorId;
}

export interface Standing extends PlayerSummary {
  score: number;
  connected: boolean;
  /** Left the match: greyed out. */
  left: boolean;
}

/** Phone camera status as the host knows it (SPEC §6.3). */
export type CameraStatus = 'unknown' | 'ok' | 'denied';

export interface LobbyPlayer extends PlayerSummary {
  /** Relay id of the phone holding this seat (TV groups shared seats, SPEC §6.3.1). */
  phoneId: string;
  ready: boolean;
  camera: CameraStatus;
  connected: boolean;
}

/** One tag as drawn on a photo (SPEC §6.4). `playerId` null = Unknown. */
export interface TagView {
  tagId: string;
  photo: number;
  x: number;
  y: number;
  playerId: SeatId | null;
}

/** One photo of the round under review; `aspect` = width / height. */
export interface PhotoInfo {
  index: number;
  aspect: number;
}

/** Catches of one player in one round. */
export interface Caught extends PlayerSummary {
  count: number;
}

/** Photographer or dodger, from this phone's point of view. */
export type Role = 'photographer' | 'dodger';

/** Fields every screen carries (SPEC §7.3). */
export interface ScreenBase {
  /** The session leader's display name (its phone's first seat); null when there is none. */
  leaderName: string | null;
  /** This phone holds leadership (SPEC §6.5). */
  isLeader: boolean;
  /** This phone's seats; empty before the first profile. */
  seats: ScreenSeat[];
  /** Shows the emoji bar (SPEC §6.6). */
  canEmoji: boolean;
}

/** Fields every in-round screen carries. */
export interface RoundBase {
  /** Round id: unique per round, so replayed or cancelled rounds never mix photos. */
  r: number;
  /** Turn number, 1-based, and the match's turn count. */
  round: number;
  rounds: number;
  role: Role;
  photographer: PlayerSummary;
  /** Photographer only: the local seat that's shooting. */
  seat?: number;
}

/** One variant per host-driven SPEC §6.7 state. `kind` is the `data-screen` value. */
export type Screen =
  | (ScreenBase & { kind: 'joining' })
  | (ScreenBase & {
      kind: 'lobby';
      players: LobbyPlayer[];
      /** This phone tapped Ready. */
      ready: boolean;
      camera: CameraStatus;
      /** Leader: ≥3 seats, every connected phone Ready, ≥1 camera (BUILD_PLAN §8). */
      canStart: boolean;
      /** Room below `MAX_SEATS`. */
      canAddSeat: boolean;
    })
  | (ScreenBase & { kind: 'rules'; card: number; cards: number })
  | (ScreenBase & { kind: 'pass'; seat: number; name: string })
  | (ScreenBase & RoundBase & { kind: 'announce' })
  | (ScreenBase & RoundBase & { kind: 'scatter'; endsInMs: number })
  | (ScreenBase & RoundBase & { kind: 'shoot'; endsInMs: number; shots: number; maxShots: number })
  | (ScreenBase & RoundBase & { kind: 'upload'; received: number; expected: number })
  | (ScreenBase &
      RoundBase & {
        kind: 'review';
        photos: PhotoInfo[];
        /** The photo everyone is looking at. */
        photo: number;
        /** Every tag of the round (the host is authoritative; SPEC §7.3). */
        tags: TagView[];
        /** Photographer's tag sheet: everyone who can be tagged. */
        candidates: PlayerSummary[];
        /** Leader: photographer gone, offer Skip review (SPEC §6.3). */
        canSkipReview: boolean;
      })
  | (ScreenBase &
      RoundBase & {
        kind: 'results';
        caught: Caught[];
        /** The photographer's score change this round (−1 per tag). */
        photographerDelta: number;
        /** Lowest first. */
        standings: Standing[];
        /** Last turn: the leader's button leads to match end. */
        last: boolean;
      })
  | (ScreenBase & { kind: 'matchEnd'; standings: Standing[]; winners: SeatId[] })
  | (ScreenBase & { kind: 'spectating' })
  | (ScreenBase & { kind: 'left' });

export type ScreenKind = Screen['kind'];

export const SCREEN_KINDS = [
  'joining',
  'lobby',
  'rules',
  'pass',
  'announce',
  'scatter',
  'shoot',
  'upload',
  'review',
  'results',
  'matchEnd',
  'spectating',
  'left',
] as const satisfies readonly ScreenKind[];

export type HostMsg = { t: 'screen'; screen: Screen } | Ack;

/** Shallow guard for what the host sends (the phone trusts the host's payload shape). */
export function isHostMsg(v: unknown): v is HostMsg {
  if (!isObj(v)) return false;
  if (v.t === 'photoAck') return isAck(v);
  return (
    v.t === 'screen' &&
    isObj(v.screen) &&
    (SCREEN_KINDS as readonly unknown[]).includes(v.screen.kind)
  );
}
