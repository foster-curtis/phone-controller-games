// Resume snapshot (SPEC §11.5, §15.8): versioned JSON in localStorage, written at the start of each
// build phase and on every run-state change during it. No RNG state: every stream derives from
// (seed, label), so a restored card offer is identical.
// Frozen at FF1 (BUILD_PLAN §3): the `RunSnapshot` shape takes additive changes only (new optional
// fields); a breaking change bumps `v`, and an old snapshot is then discarded.
import type {
  CardId,
  ClassId,
  DifficultyId,
  PlayerColorId,
  ShopItemId,
  StructureId,
  ThemeId,
} from '../../shared/ids';
import type { RunStats } from '../../shared/messages';

export const SNAPSHOT_VERSION = 1;
/** localStorage key (survives a browser crash, unlike sessionStorage). */
export const SNAPSHOT_KEY = 'fort-frenzy:run';
/** Older snapshots are discarded. */
export const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface SnapshotStructure {
  id: StructureId;
  tile: [number, number];
  /** null for snares (no HP). */
  hp: number | null;
  dischargesUsed?: number;
  fortified?: boolean;
}

export interface SnapshotSlot {
  slot: number;
  playerKey: string;
  deviceId: string;
  name: string;
  color: PlayerColorId;
  classId: ClassId;
  hp: number;
  crates: number;
  /** Emergency kits held (Quartermaster, 0 or 1). */
  kits: number;
  lastBuilt: StructureId | null;
  cards: Partial<Record<CardId, number>>;
  offer: CardId[] | null;
  picked: CardId | null;
  stats: RunStats;
  /** Commander only. `veterans` per soldier index; the rally flag's tile position. */
  squad?: { size: number; veterans: number[]; flag: [number, number] | null };
}

export interface RunSnapshot {
  v: typeof SNAPSHOT_VERSION;
  /** Wall-clock ms (host only; the sim never reads it). */
  savedAt: number;
  /** Commit hash: replays and snapshots are tied to the build. */
  build: string;
  settings: { theme: ThemeId; difficulty: DifficultyId; seed: number };
  wave: number;
  base: { hp: number; repairs: number };
  coins: number;
  /** Tier owned (archer upgrades: 0 or 1 each). */
  shop: Record<ShopItemId, number>;
  structures: SnapshotStructure[];
  cratePiles: { x: number; y: number; n: number }[];
  slots: SnapshotSlot[];
  leaderKey: string | null;
  wishlist: { item: ShopItemId; slot: number }[];
}
