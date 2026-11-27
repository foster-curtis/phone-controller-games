// Scene modules (SPEC §12.2; BUILD_PLAN TF12): the market scene calls each module for every TV event
// and every frame, so later milestones fill their own file instead of editing market.ts: coin toss
// (TF13), reveal and podium (TF18), round transition (TF16) and effects polish (TF20). Modules read
// only what the scene passes them: `WorldView`, `tv` events and screen positions (SPEC §6.11).
import type * as Phaser from 'phaser';
import type { Vec2 } from '../../content/types';
import type { RenderWorld } from '../render/world';
import type { TvEvent, WorldView } from '../sim/snapshot';
import type { SceneEntityId } from './types';

export interface SceneKit {
  readonly scene: Phaser.Scene;
  readonly world: RenderWorld;
  /** Ground point (tiles) → screen px. */
  toScreen(p: Vec2, z?: number): Vec2;
  /** A character's, merchant's or guard's foot point on screen this frame, or null. */
  foot(id: SceneEntityId): Vec2 | null;
  /** Just above that entity's head on screen, or null. */
  head(id: SceneEntityId): Vec2 | null;
}

export interface SceneModule {
  /** One TV event, after the scene's own reaction to it. */
  event?(e: TvEvent, view: WorldView, kit: SceneKit): void;
  /** Every frame while a round is on screen. */
  frame?(view: WorldView, dtMs: number, kit: SceneKit): void;
}
