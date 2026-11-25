// Tip-off API (SPEC §6.13, §12.6): open a sheet (snapshot hot set), judge a send, expire.
// Not a step of its own: the `input` and `catches` steps call it.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.
import type { StepContext } from '../systems';
import type { EntityId, PlayerId, Tip } from '../types';

export type TipOutcome = 'landed' | 'missed' | 'expired';

export interface TipoffApi {
  /** Records the sheet: hit-area targets and the hot set at this tick. */
  open(ctx: StepContext, player: PlayerId, tip: number, targets: Tip['targets']): void;
  /** Pays the fee and judges: lands if the target was hot at the snapshot or now (SPEC §6.13). */
  send(ctx: StepContext, player: PlayerId, target: number): TipOutcome;
  cancel(ctx: StepContext, player: PlayerId): void;
  /** Hot at the snapshot tick or now; NPCs always miss. */
  judge(ctx: StepContext, tip: Tip, character: EntityId): boolean;
}
