import { describe, expect, it } from 'vitest';
import { lerp, lerpAngle } from '../src/interpolate';

describe('interpolate', () => {
  it('lerp', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(lerp(-4, 4, 0.5)).toBe(0);
  });

  it('angle interpolation takes the shortest path', () => {
    const a = (170 * Math.PI) / 180;
    const b = (-170 * Math.PI) / 180;
    expect(Math.abs(lerpAngle(a, b, 0.5))).toBeCloseTo(Math.PI);
    expect(lerpAngle(a, b, 0.25)).toBeCloseTo((175 * Math.PI) / 180);
    expect(lerpAngle(b, a, 0.25)).toBeCloseTo((-175 * Math.PI) / 180);
    expect(lerpAngle(0.1, -0.1, 0.5)).toBeCloseTo(0);
    expect(lerpAngle(0, Math.PI / 2, 0.5)).toBeCloseTo(Math.PI / 4);
    expect(lerpAngle((350 * Math.PI) / 180, (10 * Math.PI) / 180, 0.5)).toBeCloseTo(0);
    expect(lerpAngle(1, 1 + 4 * Math.PI, 0.5)).toBeCloseTo(1);
    expect(lerpAngle(a, b, 0)).toBeCloseTo(a);
    expect(lerpAngle(a, b, 1)).toBeCloseTo(b);
  });
});
