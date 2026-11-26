// Local stand-in for TF3's `HoldEstimator` (SPEC §3, §12.3): used by dev mode and as the default until
// the real estimator is wired (TF7/TF12). Same contract as shared/hold.ts: the bar runs from the press,
// re-anchors on `holdStart`, and never reads 1 before the host says `complete`.
// Never imports host code.
import type { HoldEstimator, HoldEvent } from '../shared/hold';

const DEFAULT_MS = 1000;

export function createFakeHoldEstimator(): HoldEstimator {
  let start = 0;
  let duration = DEFAULT_MS;
  let state: 'idle' | 'running' | 'done' = 'idle';
  return {
    press(now) {
      start = now;
      duration = DEFAULT_MS;
      state = 'running';
    },
    correct(e: HoldEvent, now) {
      if (e.t === 'holdStart') {
        start = now - e.elapsedMs;
        duration = Math.max(1, e.durationMs);
        state = 'running';
      } else state = e.result === 'complete' ? 'done' : 'idle';
    },
    progress(now) {
      if (state === 'idle') return 0;
      if (state === 'done') return 1;
      return Math.min(0.99, Math.max(0, (now - start) / duration));
    },
    release() {
      if (state === 'running') state = 'idle';
    },
  };
}
