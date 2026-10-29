// What the TV's DOM overlay draws (SPEC §2.6, §15.2): the HUD and the full-screen TV screens (home,
// lobby, summary). Host wiring builds a `TvView` from the team state, the party and the sim; the
// overlay only renders it. World UI (nametags, aim lines, the build arc) is Phaser, not here.
// Frozen at FF1 (BUILD_PLAN §3): additive changes only.
import type { QrMatrix } from '@pcg/game-kit';
import type {
  DifficultyId,
  EnemyId,
  LaneId,
  PlayerColorId,
  ShopItemId,
  ThemeId,
} from '../../shared/ids';
import type { TeamView } from '../../shared/messages';

export type TvScreen =
  | 'loading'
  | 'home'
  | 'lobby'
  | 'countdown'
  | 'build'
  | 'combat'
  | 'victory'
  | 'defeat'
  | 'summary'
  | 'restoring';

/** Home screen rows, keyboard and gamepad driven; the focused row is lit amber (§2.6, §11.1). */
export type HomeRow =
  | { id: 'theme'; theme: ThemeId }
  | { id: 'difficulty'; difficulty: DifficultyId }
  /** Only when a snapshot exists (§11.5). */
  | { id: 'resume'; wave: number; savedAgoMs: number }
  | { id: 'newRun' }
  | { id: 'create' };

export interface TvPlayer {
  playerId: string;
  name: string;
  color: PlayerColorId;
}

/** "Foster bought Arrow Towers II" (§6.2): glyph + text, a bar in the buyer's color. */
export interface Announcement extends TvPlayer {
  /** Increasing; the overlay keys animations by it. */
  id: number;
  item: ShopItemId;
  tier: number;
}

export interface TvView {
  screen: TvScreen;
  /** null on home and loading (no room yet). */
  team: TeamView | null;
  home: { rows: HomeRow[]; focus: number; loading: number } | null;
  room: { code: string; joinUrl: string; qr: QrMatrix | null } | null;
  /** Lobby countdown (3 s), null otherwise. */
  countdownMs: number | null;
  /** Boss waves only (§9.2): along the bottom edge. */
  bossBar: { enemy: EnemyId; hp: number; maxHp: number; mk: 1 | 2 | 3; staggered: boolean } | null;
  /** Newest last; the overlay stacks them bottom-left. */
  announcements: Announcement[];
  /** Lanes glowing now (spawn warning, §9.4). */
  laneWarnings: LaneId[];
  /** Base below 25%: red vignette and "Citadel under attack" (§3.3). */
  lowHpAlarm: boolean;
  /** Build phase, right side: each requested item with who asked. */
  wishlist: { item: ShopItemId; tier: number; price: number | null; by: TvPlayer[] }[];
  /** Build phase, right side. */
  readyStatus: (TvPlayer & { ready: boolean; connected: boolean })[];
  /** Build phase: enemy types new this wave are framed in violet (§2.6). */
  nextWaveNew: EnemyId[];
  /** A phone runs a newer protocol: "Refresh the TV" (§15.6). */
  outdatedBanner: boolean;
}
