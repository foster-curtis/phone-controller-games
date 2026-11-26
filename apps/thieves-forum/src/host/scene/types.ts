// What the market scene draws each render frame (SPEC §12.2, §12.3, §6.11): the round's `WorldView`,
// the previous step's positions and the interpolation factor. Nothing here names a player: the scene
// builds characters only from `WorldView` (scene/__tests__/disguise.test.ts).
import type { Vec2 } from '../../content/types';
import type { CharacterView, WorldView } from '../sim/snapshot';

export type SceneEntityId = CharacterView['id'];

export interface FrameInput {
  view: WorldView;
  /** Positions before the last step, for render interpolation (ids missing: no lerp). */
  prev: ReadonlyMap<SceneEntityId, Vec2>;
  /** `accumulator / step`, in [0, 1). */
  alpha: number;
}

export interface SceneSource {
  /** The frame to draw, or null with no round running (the lobby covers the canvas). */
  frame(dtMs: number): FrameInput | null;
  /** Open stalls in the lobby (before a round): none known, so all draw open. */
  readonly openStalls?: readonly number[];
}

/** The debug-only dev overlay (scene/overlay.ts, loaded only behind `?debug=1`). */
export interface SceneOverlay {
  /** Character screen positions (foot points) this frame. */
  update(feet: ReadonlyMap<SceneEntityId, Vec2>): void;
  destroy(): void;
}
