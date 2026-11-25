// Host hold machine API (SPEC §3, §6.7, §6.8, §12.3): GRAB and PICKPOCKET timed from the `hold` bit.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only. The full machine API freezes at TF3.
import type { HoldKind, HoldResult } from '../../../shared/hold';
import type { StepContext } from '../systems';
import type { EntityId, Hold, HoldTarget, World } from '../types';

export interface HoldsApi {
  /** Starts a hold if the actor may (one at a time; item not held by another). Null if refused. */
  start(ctx: StepContext, actor: EntityId, kind: HoldKind, target: HoldTarget): Hold | null;
  /** Ends a hold with a result (emits `holdEnd`, stamps `holdEndedAt`). */
  end(ctx: StepContext, hold: Hold, result: HoldResult): void;
  /** The actor's live hold, if any. */
  activeFor(world: World, actor: EntityId): Hold | null;
  /** True while the character is mid-steal (a live hold), or within `graceTicks` of one ending. */
  isMidSteal(world: World, actor: EntityId, graceTicks: number): boolean;
}
