// TV DOM UI view model (SPEC §6.14–§6.16, §6.18, §6.19, §12.2): one `TvView` per match phase, rendered
// as DOM over the canvas. During `play` the HUD carries no names, scores or player colors (SPEC §6.16).
// TF6 builds the screens; `?ui=<screen>` previews them with fixtures (ui/preview.ts).
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.
import type { PlayerColorId } from '../../shared/theme';
import type { RevealView } from '../sim/snapshot';

export interface TvLobbyPlayer {
  name: string;
  color: PlayerColorId;
  ready: boolean;
  leader: boolean;
}

export interface TvPodiumRow {
  name: string;
  color: PlayerColorId;
  total: number;
  /** 1-based; ties share a place. */
  place: number;
}

export type TvView =
  | {
      phase: 'lobby';
      code: string | null;
      joinUrl: string | null;
      players: TvLobbyPlayer[];
      canStart: boolean;
    }
  | { phase: 'rules'; card: number; count: number }
  | { phase: 'roundStart'; round: number; rounds: number; endsInMs: number }
  /** The in-round HUD: timer, round pill, room code. Nothing that identifies a player. */
  | { phase: 'play'; round: number; rounds: number; timeLeftMs: number; code: string | null }
  | { phase: 'handsUp'; round: number; rounds: number }
  /** `step` = how many reveal cards have popped (lowest haul first, SPEC §6.14). */
  | { phase: 'reveal'; reveal: RevealView; step: number }
  | { phase: 'transition'; round: number; rounds: number }
  | { phase: 'podium'; rows: TvPodiumRow[]; feedbackUrl: string; step: number };
export type TvScreen = TvView['phase'];

// ---- additive at TF6 (BUILD_PLAN §8 "contract+"): host controls and reveal anchors ----------------

/**
 * What the TV's own controls (keyboard, gamepad) ask the match for (SPEC §6.16 "drivable from the
 * leader's phone, keyboard or gamepad"). The leader phone's start / how-to-play / next / skip /
 * play-again map to the same five.
 */
export type TvControl = 'start' | 'rules' | 'playAgain' | 'next' | 'skip';

/**
 * Screen position (1920 x 1080 logical px, SPEC §12.2) just above a character's head, from the
 * scene, keyed by `RevealEntry.character`. Reveal cards stand on these (SPEC §6.14).
 */
export type TvAnchors = Readonly<Record<number, { x: number; y: number }>>;
