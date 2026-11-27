// Views of the round for the renderer (SPEC §12.3): `WorldView` every frame, `RevealView` only in the
// `handsUp` phase, and a debug-only `DebugView` for the dev overlay (`?debug=1`).
// `CharacterView` has no `playerId`, `isPlayer` or controller field, so the scene cannot tell a player
// from an NPC during a round (SPEC §6.11); __tests__/snapshot.test.ts checks the type and a key allowlist.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only. Never add a player-identifying field to the
// round views; reveal data goes in `RevealView`.
import type { ItemId, Outfit, ShopId, StallId } from '../../content/types';
import type { PlayerColorId } from '../../shared/theme';
import type { EntityId, Gait, Phase, PoseId, RigId } from './types';

/** A citizen on screen: player and NPC look exactly alike. */
export interface CharacterView {
  id: EntityId;
  rig: 'citizen';
  outfit: Outfit;
  pose: PoseId;
  x: number;
  y: number;
  /** Radians (0 = +x, y down). */
  facing: number;
  gait: Gait;
}

/** The only keys a `CharacterView` may have (the disguise allowlist test). */
export const CHARACTER_VIEW_KEYS = [
  'id',
  'rig',
  'outfit',
  'pose',
  'x',
  'y',
  'facing',
  'gait',
] as const satisfies readonly (keyof CharacterView)[];

export interface MerchantView {
  id: EntityId;
  rig: 'merchant';
  stall: StallId;
  pose: PoseId;
  x: number;
  y: number;
  facing: number;
  gait: Gait;
  /** Glance stage for the swoosh and head turn (SPEC §6.6). */
  glance: 'none' | 'windup' | 'look';
  /** "?" over his head (coin, SPEC §6.9). */
  question: boolean;
  /** Point-and-shout target, with the "THIEF!" bubble. */
  shoutingAt: EntityId | null;
  carrying: ItemId | null;
}

export interface GuardView {
  id: EntityId;
  rig: 'guard';
  pose: PoseId;
  x: number;
  y: number;
  facing: number;
  gait: Gait;
  /** View cone (SPEC §6.12): direction (radians), range (tiles), half-angle, red when alert. */
  cone: { dir: number; range: number; halfAngle: number; alert: boolean };
  /** Red "!" over his head. */
  bang: boolean;
}

export interface StallSceneView {
  id: StallId;
  shop: ShopId;
  open: boolean;
  /** Item per counter spot (brought-forward items included), null = empty. */
  counter: (ItemId | null)[];
  /** Item per back-shelf spot. */
  shelf: (ItemId | null)[];
}

export interface CoinView {
  id: number;
  x: number;
  y: number;
  /** Height above the ground (tiles) while in flight. */
  z: number;
  landed: boolean;
}

export interface StocksView {
  slot: number;
  character: EntityId | null;
  endsInMs: number;
}

/** NPC point-and-shout bubbles (merchant shouts are on `MerchantView`). */
export interface BubbleView {
  by: EntityId;
  at: EntityId;
}

export interface WorldView {
  tick: number;
  phase: Phase;
  /** Round time left (HUD timer), ms; 0 outside `play`. */
  timeLeftMs: number;
  characters: CharacterView[];
  merchants: MerchantView[];
  guards: GuardView[];
  stalls: StallSceneView[];
  coins: CoinView[];
  stocks: StocksView[];
  bubbles: BubbleView[];
  gateOpen: boolean;
}

/** One player in the end-of-round reveal (SPEC §6.14), disconnected players included (§11 #30). */
export interface RevealEntry {
  character: EntityId;
  name: string;
  color: PlayerColorId;
  bag: number;
  items: { item: ItemId; value: number }[];
  /** This round's haul only. */
  haul: number;
  /** Top earner (ties share it). */
  top: boolean;
}

/** Produced only in the `handsUp` phase; ordered lowest haul → highest (SPEC §6.14). */
export interface RevealView {
  round: number;
  entries: RevealEntry[];
}

/** Dev overlay only (`?debug=1`): never drawn in a normal build. */
export interface DebugView {
  characters: {
    id: EntityId;
    control: 'npc' | 'player' | 'takeover' | 'walkOn';
    hot: boolean;
    npcState: string;
  }[];
  activations: number;
  plannedNpcs: number;
  liveNpcs: number;
}

export type { RigId };

/** TV events (TF12 contract+): the scene's other input beside `WorldView` (`ch: 'tv'` only). */
export type { TvEvent } from './events';
