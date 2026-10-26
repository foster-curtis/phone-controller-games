// Fixed-step accumulator (SPEC §8): each frame adds elapsed time, runs the owed steps (capped),
// drops excess time after a hitch, and reports `alpha` for render interpolation.

export interface FixedStepOptions {
  /** Step length, ms (default 1000/60). */
  stepMs?: number;
  /** Catch-up cap per frame (default 5). */
  maxSteps?: number;
}

export interface FrameResult {
  /** Steps run this frame. */
  steps: number;
  /** Interpolation factor `accumulator / step`, always in [0, 1). */
  alpha: number;
  /** Whole steps' worth of time dropped by the cap this frame. */
  droppedSteps: number;
}

export interface FixedStep {
  /** Add `elapsedMs` (negative / non-finite → 0) and call `step` once per owed step. */
  advance(elapsedMs: number, step: () => void): FrameResult;
  /** Current accumulator, ms. */
  readonly accumulator: number;
  reset(): void;
}

export function createFixedStep(opts: FixedStepOptions = {}): FixedStep {
  const stepMs = opts.stepMs ?? 1000 / 60;
  const maxSteps = opts.maxSteps ?? 5;
  let acc = 0;

  return {
    advance(elapsedMs, step) {
      if (Number.isFinite(elapsedMs) && elapsedMs > 0) acc += elapsedMs;
      const owed = Math.floor(acc / stepMs);
      const steps = Math.min(owed, maxSteps);
      for (let i = 0; i < steps; i++) step();
      // Carry the fractional remainder; whole steps beyond the cap are dropped (no spiral of death).
      acc -= owed * stepMs;
      if (acc < 0) acc = 0; // float guard
      let alpha = acc / stepMs;
      if (alpha >= 1) {
        acc = 0;
        alpha = 0;
      }
      return { steps, alpha, droppedSteps: owed - steps };
    },
    get accumulator() {
      return acc;
    },
    reset() {
      acc = 0;
    },
  };
}

/**
 * Catch-up cap that matches the frame clamp: a frame is at most `maxFrameMs` long, so up to
 * ceil(maxFrameMs / stepMs) steps are owed and none may be dropped. A lower cap makes the sim (and
 * every match timer, e.g. the 4 s ghost spawn) run slower than wall time below ~12 fps.
 */
export function catchUpSteps(maxFrameMs: number, stepMs: number): number {
  return Math.ceil(maxFrameMs / stepMs) + 1;
}
