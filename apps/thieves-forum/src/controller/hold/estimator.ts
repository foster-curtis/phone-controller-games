// The phone's hold progress estimate (SPEC §3, §12.5 "Hold correction"): the host measures GRAB and
// PICKPOCKET from the `hold` bit; the phone only shows a local estimate. It starts on press, caps below
// full until the host says `complete`, re-anchors on `holdStart` at `receipt − elapsedMs` (no clock
// handshake), and snaps to 0 on `cancelled` / `caught`. Times are the phone's `performance.now()` ms.
import type { HoldEvent, HoldEstimator } from '../../shared/hold';

/** The bar never shows full before the host's `complete` (SPEC §3). */
export const ESTIMATE_CAP = 0.95;

/** Duration guess before the caller or a `holdStart` gives one (the shortest §6.5 grab is 600 ms). */
const DEFAULT_DURATION_MS = 1000;

type Phase =
  | { k: 'idle' }
  /** Held: the bar runs from `anchor`. */
  | { k: 'running' }
  /** Let go while the host was timing a hold: frozen until its `holdEnd`. */
  | { k: 'released'; frozen: number }
  | { k: 'complete' };

export interface PhoneHoldEstimator extends HoldEstimator {
  /** `durationMs`: the tile's `grabMs` or the pickpocket hold, when the phone knows it. */
  press(now: number, durationMs?: number): void;
  /** The host hold this estimate follows, once a `holdStart` arrived. */
  readonly holdId: number | null;
}

export function createHoldEstimator(): PhoneHoldEstimator {
  let phase: Phase = { k: 'idle' };
  let anchor = 0;
  let duration = DEFAULT_DURATION_MS;
  let id: number | null = null;
  /** Events for holds up to this id are stale (one hold at a time; host ids only grow). */
  let endedId = 0;
  /** The control is down (between `press` and `release`). */
  let down = false;

  const running = (now: number) =>
    Math.min(ESTIMATE_CAP, Math.max(0, (now - anchor) / Math.max(1, duration)));

  const est: PhoneHoldEstimator = {
    get holdId() {
      return id;
    },

    press(now, durationMs) {
      down = true;
      if (phase.k === 'running') return;
      phase = { k: 'running' };
      anchor = now;
      if (durationMs !== undefined) duration = durationMs;
      id = null;
    },

    correct(event: HoldEvent, now) {
      if (event.id <= endedId) return;
      if (event.t === 'holdStart') {
        id = event.id;
        duration = event.durationMs;
        anchor = now - event.elapsedMs;
        // Let go already (the start crossed the release): show nothing until its `holdEnd`.
        if (!down) phase = { k: 'released', frozen: phase.k === 'released' ? phase.frozen : 0 };
        else phase = { k: 'running' };
        return;
      }
      if (id !== null && event.id < id) return;
      endedId = event.id;
      id = null;
      phase = event.result === 'complete' ? { k: 'complete' } : { k: 'idle' };
    },

    progress(now) {
      switch (phase.k) {
        case 'idle':
          return 0;
        case 'complete':
          return 1;
        case 'released':
          return phase.frozen;
        case 'running':
          return running(now);
      }
    },

    release(now) {
      down = false;
      // No host hold yet: nothing to wait for. Otherwise freeze and let `holdEnd` decide.
      if (phase.k === 'running' && id !== null) phase = { k: 'released', frozen: running(now) };
      else if (phase.k === 'running' || phase.k === 'complete') phase = { k: 'idle' };
    },
  };
  return est;
}
