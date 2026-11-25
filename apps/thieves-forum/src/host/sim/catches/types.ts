// Catch API (SPEC §6.13): in-person Catch!, guard catches, pots and payouts, stocks.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.
import type { StepContext } from '../systems';
import type { EntityId, PlayerId } from '../types';

/** Who made a catch (SPEC §6.13 payout table). */
export type CatchKind = 'player' | 'guardTip' | 'guardChase';

export interface CatchesApi {
  /** A Catch! press by `catcher`: right if the touched target is mid-steal (+ grace), else wrong. */
  inPerson(ctx: StepContext, catcher: EntityId): void;
  /** A guard reached `thief`: pot, stocks, payouts (`tipper` gets ¼ for a tip). */
  byGuard(
    ctx: StepContext,
    guard: EntityId,
    thief: EntityId,
    kind: CatchKind,
    tipper?: PlayerId,
  ): void;
  /** Not in the stocks and past post-stocks immunity (SPEC §6.13). */
  catchable(ctx: StepContext, thief: EntityId): boolean;
}
