import { describe, expect, it } from 'vitest';
import { createFixedStep } from '../fixedStep';

const STEP = 1000 / 60;

describe('fixedStep', () => {
  it('runs floor(acc / step) steps and carries the remainder', () => {
    const fs = createFixedStep();
    let n = 0;
    const tick = () => n++;
    expect(fs.advance(10, tick)).toMatchObject({ steps: 0, droppedSteps: 0 });
    expect(n).toBe(0);
    const r = fs.advance(10, tick); // acc = 20 → 1 step, 3.33 left
    expect(r.steps).toBe(1);
    expect(n).toBe(1);
    expect(fs.accumulator).toBeCloseTo(20 - STEP);
    expect(r.alpha).toBeCloseTo((20 - STEP) / STEP);
    expect(fs.advance(STEP * 2.5, tick).steps).toBe(2);
    expect(n).toBe(3);
  });

  it('caps at 5 steps per frame and drops the excess', () => {
    const fs = createFixedStep();
    let n = 0;
    const r = fs.advance(STEP * 12.25, () => n++);
    expect(r.steps).toBe(5);
    expect(n).toBe(5);
    expect(r.droppedSteps).toBe(7);
    expect(fs.accumulator).toBeLessThan(STEP);
    expect(r.alpha).toBeCloseTo(0.25);
    // No spiral: the next normal frame runs a normal number of steps.
    expect(fs.advance(STEP, () => n++).steps).toBe(1);
  });

  it('alpha is always in [0, 1)', () => {
    const fs = createFixedStep();
    let seed = 7;
    for (let i = 0; i < 5000; i++) {
      seed = (seed * 16807) % 2147483647;
      const dt = (seed / 2147483647) * 120;
      const { alpha, steps } = fs.advance(dt, () => {});
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
      expect(steps).toBeLessThanOrEqual(5);
    }
    for (const k of [1, 2, 3, 60]) {
      const f = createFixedStep();
      for (let i = 0; i < 100; i++) {
        const { alpha } = f.advance(STEP * k, () => {});
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThan(1);
      }
    }
  });

  it('ignores negative / non-finite elapsed time and resets', () => {
    const fs = createFixedStep({ stepMs: 10, maxSteps: 3 });
    expect(fs.advance(-50, () => {}).steps).toBe(0);
    expect(fs.advance(Number.NaN, () => {}).steps).toBe(0);
    expect(fs.advance(Number.POSITIVE_INFINITY, () => {}).steps).toBe(0);
    fs.advance(7, () => {});
    expect(fs.accumulator).toBe(7);
    fs.reset();
    expect(fs.accumulator).toBe(0);
    expect(fs.advance(45, () => {}).steps).toBe(3);
  });
});
