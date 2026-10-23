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
  /** This phone's profile; `color` tints the pads. null until assigned. */
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

/** One variant per host-driven SPEC §6.7 state. Joining, charging, self-paused and reconnecting are phone-local. */
export type Screen =
  | (ScreenBase & { kind: 'lobby'; takenColors: PlayerColorId[]; canStart: boolean })
  | (ScreenBase & { kind: 'countdown'; ms: number })
  | (ScreenBase & { kind: 'playing' })
  | (ScreenBase & { kind: 'eliminated'; respawnMs: number })
  | (ScreenBase & { kind: 'ghost' })
  | (ScreenBase & { kind: 'spectating' })
  | (ScreenBase & { kind: 'results'; survivorId: string | null })
  | (ScreenBase & { kind: 'matchEnd'; winnerId: string })
  | (ScreenBase & { kind: 'gamePaused' })
  | (ScreenBase & { kind: 'left' });

export type ScreenKind = Screen['kind'];

export type HostMsg = { t: 'screen'; screen: Screen };
