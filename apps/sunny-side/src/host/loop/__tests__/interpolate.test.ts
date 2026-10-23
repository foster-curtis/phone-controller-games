import { describe, expect, it } from 'vitest';
import type { EggState, SimSnapshot } from '../../sim/types';
import { interpolateSnapshot, lerp, lerpAngle } from '../interpolate';

function eggAt(id: string, x: number, y: number, angle: number): EggState {
  return {
    id,
    x,
    y,
    angle,
    vx: 0,
    vy: 0,
    radius: 36,
    frozen: false,
    slamCharge: 0,
    slamMax: false,
    massBoost: false,
    dashCooldown: 0,
  };
}

describe('interpolate', () => {
  it('lerp', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(lerp(-4, 4, 0.5)).toBe(0);
  });

  it('angle interpolation takes the shortest path', () => {
    const a = (170 * Math.PI) / 180;
    const b = (-170 * Math.PI) / 180;
    // Through ±180°, not through 0°.
    expect(Math.abs(lerpAngle(a, b, 0.5))).toBeCloseTo(Math.PI);
    expect(lerpAngle(a, b, 0.25)).toBeCloseTo((175 * Math.PI) / 180);
    expect(lerpAngle(b, a, 0.25)).toBeCloseTo((-175 * Math.PI) / 180);
    expect(lerpAngle(0.1, -0.1, 0.5)).toBeCloseTo(0);
    expect(lerpAngle(0, Math.PI / 2, 0.5)).toBeCloseTo(Math.PI / 4);
    // Unwrapped inputs (e.g. 350° vs 10°) still go the short way.
    expect(lerpAngle((350 * Math.PI) / 180, (10 * Math.PI) / 180, 0.5)).toBeCloseTo(0);
    expect(lerpAngle(1, 1 + 4 * Math.PI, 0.5)).toBeCloseTo(1);
    // Endpoints.
    expect(lerpAngle(a, b, 0)).toBeCloseTo(a);
    expect(lerpAngle(a, b, 1)).toBeCloseTo(b);
  });

  it('interpolates positions, angles and the arena radius; new eggs snap, removed eggs drop', () => {
    const prev: SimSnapshot = {
      tick: 1,
      arena: { radius: 300, startRadius: 300, shrinking: true },
      eggs: [eggAt('a', 0, 0, 3), eggAt('gone', 5, 5, 0)],
      ghosts: [{ id: 'g', x: 0, y: 0, windup: 0, cooldown: 0 }],
    };
    const curr: SimSnapshot = {
      tick: 2,
      arena: { radius: 290, startRadius: 300, shrinking: true },
      eggs: [eggAt('a', 10, -10, -3), eggAt('new', 50, 50, 1)],
      ghosts: [{ id: 'g', x: 20, y: 0, windup: 0.5, cooldown: 0 }],
    };
    const out = interpolateSnapshot(prev, curr, 0.5);
    expect(out.tick).toBe(2);
    expect(out.arena.radius).toBe(295);
    expect(out.eggs.map((e) => e.id)).toEqual(['a', 'new']);
    expect(out.eggs[0]).toMatchObject({ x: 5, y: -5 });
    expect(Math.abs(out.eggs[0]!.angle)).toBeCloseTo(Math.PI);
    expect(out.eggs[1]).toEqual(curr.eggs[1]);
    expect(out.ghosts[0]).toEqual({ id: 'g', x: 10, y: 0, windup: 0.5, cooldown: 0 });
    // Inputs are untouched.
    expect(curr.eggs[0]!.x).toBe(10);
    expect(prev.arena.radius).toBe(300);
  });
});
