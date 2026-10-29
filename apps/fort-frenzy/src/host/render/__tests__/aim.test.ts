// Aim snapping with 8° hysteresis, sentry aims, the mortar clamp and facing (SPEC §15.2).
import { describe, expect, it } from 'vitest';
import {
  MORTAR_CLAMP_DEG,
  mortarTubeAngle,
  pickFacing,
  snapSentryAim,
  snapTurretAim,
} from '../aim';

const rad = (d: number) => (d * Math.PI) / 180;

describe('pulse-turret aim (8 frames)', () => {
  it('snaps to the nearest aim; s faces the camera', () => {
    expect(snapTurretAim(rad(0))).toBe('e');
    expect(snapTurretAim(rad(44))).toBe('se');
    expect(snapTurretAim(rad(90))).toBe('s');
    expect(snapTurretAim(rad(181))).toBe('w');
    expect(snapTurretAim(rad(-90))).toBe('n');
    expect(snapTurretAim(rad(-30))).toBe('ne');
  });

  it('keeps the frame until the target is 8° past the sector boundary', () => {
    // e covers ±22.5°; with hysteresis it holds to ±30.5°.
    expect(snapTurretAim(rad(25), 'e')).toBe('e');
    expect(snapTurretAim(rad(30.4), 'e')).toBe('e');
    expect(snapTurretAim(rad(30.6), 'e')).toBe('se');
    // Coming back, se holds until 45 − 30.5 = 14.5°.
    expect(snapTurretAim(rad(15), 'se')).toBe('se');
    expect(snapTurretAim(rad(14.4), 'se')).toBe('e');
    // Wraps around ±180°.
    expect(snapTurretAim(rad(-28), 'e')).toBe('e');
    expect(snapTurretAim(rad(-31), 'e')).toBe('ne');
  });

  it('does not flicker on a jittery target at a boundary', () => {
    let aim = snapTurretAim(rad(20));
    const seen = new Set([aim]);
    for (let i = 0; i < 50; i++) {
      aim = snapTurretAim(rad(22.5 + (i % 2 ? 4 : -4)), aim);
      seen.add(aim);
    }
    expect([...seen]).toEqual(['e']);
  });
});

describe('sentry aims (5 frames)', () => {
  it('maps l dl c dr r, with targets behind the wall line clamped to the sides', () => {
    expect(snapSentryAim(rad(90))).toBe('c');
    expect(snapSentryAim(rad(130))).toBe('dl');
    expect(snapSentryAim(rad(40))).toBe('dr');
    expect(snapSentryAim(rad(-10))).toBe('r');
    expect(snapSentryAim(rad(200))).toBe('l');
  });

  it('uses the same 8° hysteresis', () => {
    expect(snapSentryAim(rad(64), 'c')).toBe('c');
    expect(snapSentryAim(rad(59), 'c')).toBe('dr');
  });
});

describe('mortar tube', () => {
  it('points straight up for a target straight up-screen, clamps to ±75°', () => {
    expect(mortarTubeAngle(0, -1)).toBeCloseTo(0);
    expect(mortarTubeAngle(1, -1)).toBeCloseTo(rad(45));
    expect(mortarTubeAngle(1, 0)).toBeCloseTo(rad(MORTAR_CLAMP_DEG));
    expect(mortarTubeAngle(-1, 1)).toBeCloseTo(-rad(75));
    expect(mortarTubeAngle(0, 0)).toBe(0);
  });
});

describe('facing', () => {
  it('picks the view from the stronger axis', () => {
    expect(pickFacing(1, 0.2)).toEqual({ view: 'side', mirror: false });
    expect(pickFacing(-1, 0.2)).toEqual({ view: 'side', mirror: true });
    expect(pickFacing(0.2, 1)).toEqual({ view: 'front', mirror: false });
    expect(pickFacing(0.2, -1)).toEqual({ view: 'back', mirror: false });
  });

  it('switches axis only when the other is 15% stronger, and keeps facing on zero input', () => {
    const side = pickFacing(1, 0);
    expect(pickFacing(1, 1.1, side).view).toBe('side');
    expect(pickFacing(1, 1.2, side).view).toBe('front');
    const front = pickFacing(0, 1);
    expect(pickFacing(1.1, 1, front).view).toBe('front');
    expect(pickFacing(1.2, 1, front).view).toBe('side');
    expect(pickFacing(0, 0, front)).toBe(front);
  });
});
