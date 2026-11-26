// Phone hold estimate (SPEC §3, §12.5): local start, 95% cap until `complete`, re-anchor on `holdStart`,
// snap to 0 on `cancelled` / `caught`.
import { describe, expect, it } from 'vitest';
import type { HoldEvent } from '../../../shared/hold';
import { createHoldEstimator, ESTIMATE_CAP } from '../estimator';

const start = (id: number, durationMs: number, elapsedMs = 0): HoldEvent => ({
  t: 'holdStart',
  id,
  kind: 'grab',
  durationMs,
  elapsedMs,
});
const end = (id: number, result: 'complete' | 'cancelled' | 'caught'): HoldEvent => ({
  t: 'holdEnd',
  id,
  result,
});

describe('HoldEstimator', () => {
  it('is 0 when idle and starts locally on press', () => {
    const e = createHoldEstimator();
    expect(e.progress(0)).toBe(0);
    e.press(100, 1000);
    expect(e.progress(100)).toBe(0);
    expect(e.progress(600)).toBeCloseTo(0.5);
  });

  it('caps at 95% until the host says complete, then shows full', () => {
    const e = createHoldEstimator();
    e.press(0, 1000);
    e.correct(start(1, 1000), 50);
    expect(e.progress(5000)).toBe(ESTIMATE_CAP);
    e.correct(end(1, 'complete'), 5000);
    expect(e.progress(5000)).toBe(1);
    e.release(5100);
    expect(e.progress(5100)).toBe(0);
  });

  it('re-anchors on holdStart at receipt − elapsedMs, whatever the local guess was', () => {
    const e = createHoldEstimator();
    e.press(0); // duration unknown: a default guess
    e.correct(start(3, 2000, 40), 300);
    // anchored at 260
    expect(e.progress(260)).toBe(0);
    expect(e.progress(1260)).toBeCloseTo(0.5);
    expect(e.holdId).toBe(3);
  });

  it('snaps to 0 on cancelled and caught', () => {
    for (const result of ['cancelled', 'caught'] as const) {
      const e = createHoldEstimator();
      e.press(0, 1000);
      e.correct(start(1, 1000), 100);
      expect(e.progress(600)).toBeGreaterThan(0);
      e.correct(end(1, result), 600);
      expect(e.progress(600)).toBe(0);
      expect(e.progress(2000)).toBe(0);
    }
  });

  it('a release with no host hold goes idle at once', () => {
    const e = createHoldEstimator();
    e.press(0, 1000);
    e.release(200);
    expect(e.progress(300)).toBe(0);
  });

  it('a release while the host is timing freezes the bar until holdEnd decides', () => {
    const e = createHoldEstimator();
    e.press(0, 1000);
    e.correct(start(1, 1000), 100);
    e.release(600);
    expect(e.progress(900)).toBeCloseTo(0.5);
    e.correct(end(1, 'complete'), 950);
    expect(e.progress(950)).toBe(1);

    const f = createHoldEstimator();
    f.press(0, 1000);
    f.correct(start(1, 1000), 100);
    f.release(600);
    f.correct(end(1, 'cancelled'), 700);
    expect(f.progress(700)).toBe(0);
  });

  it('a holdStart that crosses the release shows nothing until its holdEnd', () => {
    const e = createHoldEstimator();
    e.press(0, 1000);
    e.release(50);
    e.correct(start(1, 1000), 200);
    expect(e.progress(800)).toBe(0);
    e.correct(end(1, 'cancelled'), 300);
    expect(e.progress(800)).toBe(0);
  });

  it('ignores stale events from an earlier hold', () => {
    const e = createHoldEstimator();
    e.press(0, 1000);
    e.correct(start(1, 1000), 50);
    e.correct(end(1, 'cancelled'), 100);
    e.press(200, 1000);
    e.correct(start(2, 1000), 250);
    e.correct(end(1, 'complete'), 300); // late duplicate of hold 1
    e.correct(start(1, 1000), 300);
    expect(e.holdId).toBe(2);
    expect(e.progress(750)).toBeCloseTo(0.5);
  });
});
