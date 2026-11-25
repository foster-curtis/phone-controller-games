// Distraction handler list (SPEC §6.9; §9 prep: noisy distraction is a second handler later).
// Coin toss is the first and only v1 handler.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.
import type { Vec2 } from '../../../content/types';
import type { StepContext } from '../systems';
import type { EntityId, World } from '../types';

/** Append-only (SPEC §9). */
export const DISTRACTION_IDS = ['coinToss'] as const;
export type DistractionId = (typeof DISTRACTION_IDS)[number];

export interface DistractionHandler {
  id: DistractionId;
  /** Cooldown and cost checks for `actor`. */
  canUse(world: World, actor: EntityId): boolean;
  /** Starts the distraction aimed at `dir` (unit vector, or the facing). False if refused. */
  use(ctx: StepContext, actor: EntityId, dir: Vec2): boolean;
  /** Advances live distractions (coin flight, merchant reaction). */
  step(ctx: StepContext): void;
}
