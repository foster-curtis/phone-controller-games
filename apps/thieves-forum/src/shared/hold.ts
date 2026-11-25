// Hold actions under latency (SPEC §3, §6.7, §6.8, §12.3, §12.5): GRAB and PICKPOCKET are measured on
// the host from the input `hold` bit; the phone shows a local estimate corrected by these host events.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.

export const HOLD_KINDS = ['grab', 'pickpocket'] as const;
export type HoldKind = (typeof HOLD_KINDS)[number];

/** How a hold ended (SPEC §3: complete / cancelled / caught). */
export const HOLD_RESULTS = ['complete', 'cancelled', 'caught'] as const;
export type HoldResult = (typeof HOLD_RESULTS)[number];

/**
 * Host → phone: the host started timing hold `id`. `elapsedMs` is how long it had already run when
 * sent, so the phone anchors its estimate at `receipt − elapsedMs` (no clock handshake).
 */
export interface HoldStartMsg {
  t: 'holdStart';
  id: number;
  kind: HoldKind;
  /** Total host hold time, ms (grab: the tile's `grabMs`; pickpocket: `balance.pickpocket.holdMs`). */
  durationMs: number;
  elapsedMs: number;
  /** GRAB only: the tile being held. */
  stall?: number;
  slot?: number;
}

/** Host → phone: hold `id` ended. */
export interface HoldEndMsg {
  t: 'holdEnd';
  id: number;
  result: HoldResult;
}

export type HoldEvent = HoldStartMsg | HoldEndMsg;

/**
 * The phone's local hold estimate (TF3). Times are the phone's `performance.now()` ms.
 * `press` starts an optimistic bar; `correct` re-anchors or ends it from a host event; `release` stops
 * it locally (the host decides the result).
 */
export interface HoldEstimator {
  press(now: number): void;
  correct(event: HoldEvent, now: number): void;
  /** 0..1; 0 when idle. */
  progress(now: number): number;
  release(now: number): void;
}
