// Game messages between phones and the host (SPEC §6.7, §7.2, §7.3), carried in relay `send.data`.
// Frozen at F0: additive changes only.

export const GAME_ID = 'sunny-side';

/** Spectator reactions (decision #22); `{ t: 'emoji', i }` indexes this. */
export const EMOJI = ['🔥', '😂', '😱', '👏', '🍳'] as const;
export type EmojiIndex = 0 | 1 | 2 | 3 | 4;

/** The brand kit's 8 player colors, in brand order (`--player-<id>` in brand.css). */
export const PLAYER_COLOR_IDS = [
  'crimson',
  'cobalt',
  'jade',
  'berry',
  'bone',
  'sky',
  'rose',
  'forest',
] as const;
export type PlayerColorId = (typeof PLAYER_COLOR_IDS)[number];

export function isPlayerColorId(v: unknown): v is PlayerColorId {
  return typeof v === 'string' && (PLAYER_COLOR_IDS as readonly string[]).includes(v);
}

// ---- phone → host ----

/** Button bits in `InputTuple[2]`. */
export const BUTTON_DASH = 1;
export const BUTTON_SLAM = 2;
export const STICK_MAX = 100;

/**
 * `[x, y, buttons, dashCount, slamCount]` (SPEC §7.2): x/y ints −100..100 (deadzone applied on the
 * phone), buttons bitmask, monotonic press counters.
 */
export type InputTuple = [
  x: number,
  y: number,
  buttons: number,
  dashCount: number,
  slamCount: number,
];

export function isInput(v: unknown): v is InputTuple {
  if (!Array.isArray(v) || v.length !== 5) return false;
  if (!v.every((n) => Number.isInteger(n))) return false;
  const [x, y, buttons, dashCount, slamCount] = v as InputTuple;
  return (
    Math.abs(x) <= STICK_MAX &&
    Math.abs(y) <= STICK_MAX &&
    buttons >= 0 &&
    buttons <= (BUTTON_DASH | BUTTON_SLAM) &&
    dashCount >= 0 &&
    slamCount >= 0
  );
}

export type LeaderAction = 'start' | 'next' | 'rematch' | 'lobby';

export type ControllerMsg =
  | InputTuple
  | { t: 'profile'; name: string; color: PlayerColorId }
  | { t: 'pause' }
  | { t: 'resume' }
  | { t: 'emoji'; i: EmojiIndex }
  | { t: 'leader'; action: LeaderAction }
  /**
   * Leader only (C3 note, M3-fix-2): remove `playerId` from the room (connected or away, any phase).
   * Same effect as that player tapping Leave game, plus a relay kick. Self-remove is ignored.
   */
  | { t: 'leader'; action: 'remove'; playerId: string }
  /** Leave game: full removal (score, color and spot are not kept; SPEC §6.7). */
  | { t: 'leave' };

// ---- host → phone ----

export interface Standing {
  playerId: string;
  name: string;
  color: PlayerColorId;
  score: number;
  connected: boolean;
  /** Left the match: shown greyed out (SPEC §6.7). */
  left: boolean;
}

/** Fields every screen carries. */
export interface ScreenBase {
  /** This phone is the session leader (sees Start / Next round / Rematch / Back to lobby). */
  isLeader: boolean;
  /** Current round, 1-based; 0 before the first round. */
  round: number;
  targetScore: number;
  /** This phone's profile; `color` fills the top banner and joystick knob. null until assigned. */
  name: string;
  color: PlayerColorId | null;
  /** Sorted by score, highest first. */
  standings: Standing[];
  /**
   * The session leader's name, for "Waiting for {leader}…" on other phones (SPEC §6.5). Added by the
   * host's net layer (M6) on every screen it sends; absent/null when there is no leader.
   */
  leaderName?: string | null;
}

/** One reason a player earned points this round (SPEC §6.1 scoring). */
export type RoundPointItem =
  /** Knockout credit for eliminating `victimId` (+`points`, currently +1). */
  | { kind: 'ko'; victimId: string; victimName: string; points: number }
  /** Sole-survivor bonus (+`points`, currently +3). */
  | { kind: 'survivor'; points: number };

/** One player who had an egg in the round: what they earned and how they went out. */
export interface RoundBreakdownEntry {
  playerId: string;
  name: string;
  color: PlayerColorId;
  /** Points earned this round (= sum of `items[].points`). */
  points: number;
  /** Match score after this round. */
  total: number;
  /** Left the match (greyed out, like `Standing.left`). */
  left: boolean;
  /** In the order earned: knockouts first, the survivor bonus last. Empty = scored nothing. */
  items: RoundPointItem[];
  /**
   * How they went out: `by`/`byName` = who got the knockout credit, both null = fell off with no
   * credit. `null` = never knocked out this round (survived, or their egg was still on the pan).
   * `ghost` (M3-fix-2, always set by the match; absent = false): a ghost pulse pushed them out (the
   * sim's `byGhost`). `by` null + `ghost` true → "Knocked out by ghost" (no name); with a `by`, the
   * living attacker kept the credit and is named as usual.
   */
  out: { by: string | null; byName: string | null; ghost?: boolean } | null;
}

/** Points breakdown of the round just played (results / match-end, SPEC §6.6, §6.7). */
export interface RoundBreakdown {
  /** The round this breakdown is for (1-based). */
  round: number;
  /** Only players who had an egg this round, in standings order (total desc, then join order). */
  players: RoundBreakdownEntry[];
}

/** One variant per host-driven SPEC §6.7 state. Joining, charging, self-paused and reconnecting are phone-local. */
export type Screen =
  | (ScreenBase & { kind: 'lobby'; takenColors: PlayerColorId[]; canStart: boolean })
  | (ScreenBase & { kind: 'countdown'; ms: number })
  | (ScreenBase & { kind: 'playing' })
  | (ScreenBase & { kind: 'eliminated'; respawnMs: number })
  | (ScreenBase & { kind: 'ghost' })
  | (ScreenBase & { kind: 'spectating' })
  | (ScreenBase & {
      kind: 'results';
      survivorId: string | null;
      /** The round just played; null/absent after a host-refresh restore (in-round state discarded). */
      breakdown?: RoundBreakdown | null;
    })
  | (ScreenBase & {
      kind: 'matchEnd';
      winnerId: string;
      /** The final round's breakdown; null/absent after a host-refresh restore. */
      breakdown?: RoundBreakdown | null;
    })
  | (ScreenBase & { kind: 'gamePaused' })
  | (ScreenBase & { kind: 'left' });

export type ScreenKind = Screen['kind'];

export type HostMsg = { t: 'screen'; screen: Screen };
