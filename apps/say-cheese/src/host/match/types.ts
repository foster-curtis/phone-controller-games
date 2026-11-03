// Match state machine contract (SPEC §6.1–§6.5, §8): plain TS, no DOM or networking. The match is a
// reducer `(state, event) → (state, effects)`; host wiring (SC5) feeds it events and runs the effects.
// Frozen at SC0 (BUILD_PLAN §3): additive changes only.
import type {
  Caught,
  CameraStatus,
  PhoneMsg,
  PlayerColorId,
  PlayerSummary,
  Screen,
  Standing,
  TagView,
} from '../../shared/messages';
import type { Ack } from '../../shared/blob-transfer/types';
import type { SeatId } from '../../shared/seats/types';

/** SPEC §8: `lobby → rules → (pass → announce → scatter → shoot → upload → review → results)×N → matchEnd`. */
export type Phase =
  | 'lobby'
  | 'rules'
  | 'pass'
  | 'announce'
  | 'scatter'
  | 'shoot'
  | 'upload'
  | 'review'
  | 'results'
  | 'matchEnd';

/** One player = one seat (SPEC §6.3.1). Camera and ready are per phone, mirrored on each seat. */
export interface Player {
  /** Seat id, e.g. `p3#1`. */
  id: SeatId;
  /** Relay `playerId` of the phone holding this seat. */
  phoneId: string;
  /** Phone-local seat index. */
  seat: number;
  /** Late-rejoin key: the relay `playerKey` for seat 0, the phone's `seatKey` otherwise. */
  playerKey: string;
  name: string;
  color: PlayerColorId;
  score: number;
  connected: boolean;
  camera: CameraStatus;
  ready: boolean;
  /** Join order across the room: leader handoff and tie order. */
  joinIndex: number;
  /** Joined mid-match: watches, can't be tagged, plays next match (SPEC §6.3). */
  spectator: boolean;
  /** Left or removed (SPEC §6.3): kept only so standings can grey them out. */
  left: boolean;
}

/** A photo of the current round; `url` is set once every chunk has arrived. */
export interface RoundPhoto {
  index: number;
  /** width / height. */
  aspect: number;
  url?: string;
}

export type Tag = TagView;

export interface Round {
  /** Round id, unique per round (replays get a new one). */
  r: number;
  photographer: SeatId;
  photos: RoundPhoto[];
  tags: Tag[];
  /** Shots the phone reported (`shot` / `shootDone`). */
  shots: number;
  /** `shootDone` arrived. */
  shootDone: boolean;
  /** Photo on screen during review. */
  view: number;
}

/** What the last finished round scored (results screen). */
export interface RoundResult {
  r: number;
  photographer: SeatId;
  caught: { playerId: SeatId; count: number }[];
  photographerDelta: number;
}

export interface MatchState {
  phase: Phase;
  /** Room code, for the TV lobby. */
  code: string | null;
  /** Every seat ever in the room this match, in join order (left seats kept for standings). */
  players: Player[];
  /** Relay id of the leader's phone (SPEC §6.5). */
  leader: string | null;
  /** Seats still to be photographer this match, in order. */
  queue: SeatId[];
  /** Turns taken this match (1-based turn number of the current round once started). */
  turn: number;
  /** Turns in this match (seats at match start). */
  turns: number;
  round: Round | null;
  lastResult: RoundResult | null;
  /** Rules overview card (0-based). */
  rulesCard: number;
  /** The room has seen the rules once (Rematch skips them). */
  rulesSeen: boolean;
  /** Next round id. */
  nextR: number;
  /** Counter for `joinIndex`. */
  nextJoin: number;
  /** Matches started in this room. */
  matchNo: number;
}

/** Per-phase view model the TV renders (SPEC §6.6). */
export type TvView =
  | {
      phase: 'lobby';
      code: string | null;
      leaderName: string | null;
      players: (PlayerSummary & {
        phoneId: string;
        ready: boolean;
        camera: CameraStatus;
        connected: boolean;
      })[];
      canStart: boolean;
    }
  | { phase: 'rules'; card: number; cards: number }
  | { phase: 'pass'; photographer: PlayerSummary }
  | { phase: 'announce'; photographer: PlayerSummary; turn: number; turns: number }
  | { phase: 'scatter'; photographer: PlayerSummary; endsInMs: number }
  | {
      phase: 'shoot';
      photographer: PlayerSummary;
      endsInMs: number;
      shots: number;
      maxShots: number;
    }
  | { phase: 'upload'; photographer: PlayerSummary; received: number; expected: number }
  | {
      phase: 'review';
      photographer: PlayerSummary;
      photo: RoundPhoto | null;
      photoIndex: number;
      photoCount: number;
      /** Tags on the current photo, with who they name (null = Unknown). */
      tags: (Tag & { player: PlayerSummary | null })[];
      /** "Caught this round", live. */
      caught: Caught[];
      canSkipReview: boolean;
    }
  | {
      phase: 'results';
      photographer: PlayerSummary;
      caught: Caught[];
      photographerDelta: number;
      standings: Standing[];
      last: boolean;
    }
  | { phase: 'matchEnd'; standings: Standing[]; winners: SeatId[] };

/** Relay peer change (mirrors net-client's `PeerEvent`; match/ can't import net-client). */
export type PeerEvent = 'joined' | 'left' | 'rejoined';

/** Host timers (SPEC §8). */
export type TimerId = 'scatter' | 'shoot' | 'upload';

/** The host's own controls (keyboard / buttons): the leader actions, plus remove. */
export type HostControl =
  | { action: 'start' | 'howToPlay' | 'next' | 'skip' | 'skipReview' | 'rematch' | 'lobby' }
  | { action: 'remove'; playerId: SeatId };

/** Inputs to the match reducer. */
export type MatchEvent =
  | { type: 'msg'; from: string; msg: PhoneMsg }
  | { type: 'peer'; event: PeerEvent; playerId: string; playerKey: string }
  | { type: 'timer'; timer: TimerId }
  | { type: 'control'; control: HostControl }
  /** Blob receiver finished a photo (object URL ready). */
  | { type: 'photo'; r: number; photo: number; url: string }
  /** Room created or reclaimed. */
  | { type: 'room'; code: string };

/** Outputs the host wiring runs. */
export type Effect =
  | { type: 'screen'; to: string; screen: Screen }
  | { type: 'ack'; to: string; ack: Ack }
  | { type: 'kick'; to: string }
  | { type: 'startTimer'; timer: TimerId; ms: number }
  | { type: 'clearTimer'; timer: TimerId }
  | { type: 'persist'; data: PersistedMatch }
  /** Revoke these photos' object URLs (match end, cancelled round). */
  | { type: 'releasePhotos'; urls: string[] };

/** `sessionStorage` snapshot for a host refresh (SPEC §6.3). Photos are never persisted. */
export interface PersistedMatch {
  v: 1;
  phase: Phase;
  players: Player[];
  leader: string | null;
  queue: SeatId[];
  turn: number;
  turns: number;
  /** Photographer of the round in progress: it is replayed after a refresh. */
  replay: SeatId | null;
  rulesSeen: boolean;
  nextR: number;
  nextJoin: number;
  matchNo: number;
}
