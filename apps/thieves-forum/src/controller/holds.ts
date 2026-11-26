// Hold plumbing for the phone (SPEC §3, §6.7, §6.8, §12.3): a press sets the `hold` input bit and starts
// the injected `HoldEstimator` bar; the host times the real hold from the bit and corrects the bar with
// `holdStart` / `holdEnd`. The bar never reads 100% before `holdEnd complete`.
// Never imports host code.
import type { HoldKind } from '../shared/hold';
import type { Ctx } from './ctx';

/** How long a completed bar stays full before it clears, ms. */
export const COMPLETE_SHOW_MS = 500;

export function pressHold(ctx: Ctx, kind: HoldKind, slot?: number): void {
  if (ctx.state.press) return;
  ctx.state.press = { kind, ...(slot !== undefined ? { slot } : {}) };
  ctx.estimator.press(ctx.now());
  ctx.controls.hold(true);
}

export function releaseHold(ctx: Ctx): void {
  if (!ctx.state.press) return;
  ctx.state.press = null;
  ctx.estimator.release(ctx.now());
  ctx.controls.hold(false);
}

/**
 * The bar fill for a hold of `kind` (and tile `slot` for a grab), 0..100, or null when that hold isn't
 * active. 100 only after the host ended it `complete`; the estimator's own 1.0 shows as 99.
 */
export function holdPct(
  ctx: Ctx,
  kind: HoldKind,
  slot: number | undefined,
  now: number,
): number | null {
  const { hold, press } = ctx.state;
  const mine = (k: HoldKind, s?: number) => k === kind && (kind === 'pickpocket' || s === slot);
  if (hold && mine(hold.kind, hold.slot)) {
    if (hold.result === 'complete') return 100;
    return Math.min(99, Math.floor(ctx.estimator.progress(now) * 100));
  }
  if (press && mine(press.kind, press.slot))
    return Math.min(99, Math.floor(ctx.estimator.progress(now) * 100));
  return null;
}

/** Clears a completed hold once its full bar has been shown. */
export function expireHold(ctx: Ctx, now: number): void {
  const h = ctx.state.hold;
  if (h?.result && h.endedAt !== undefined && now - h.endedAt > COMPLETE_SHOW_MS)
    ctx.state.hold = null;
}
