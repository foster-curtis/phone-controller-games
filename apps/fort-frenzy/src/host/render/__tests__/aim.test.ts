// Aim snapping with 8° hysteresis, sentry aims and facing (SPEC §15.2).
import { describe, expect, it } from 'vitest';
import { heldAim, pickFacing, snapSentryAim } from '../aim';

const rad = (d: number) => (d * Math.PI) / 180;

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

describe('facing holds through an attack clip (RC2)', () => {
  it('a knight shooting right while moving left faces right until the clip ends, then turns', () => {
    const shot = 0; // aimed right
    const move = { x: -1, y: 0 }; // walking left
    let facing = pickFacing(1, 0, null);
    // Mid-clip (Artificer burst, super, mine kneel and throw hold too): the attack's aim wins.
    for (const clip of ['attack', 'super', 'build', 'throw']) {
      const a = heldAim(clip, false, shot);
      expect(a).toBe(shot);
      facing = pickFacing(Math.cos(a!), Math.sin(a!), facing);
      expect(facing).toEqual({ view: 'side', mirror: false });
    }
    // Clip over: no hold, so the movement facing returns.
    expect(heldAim('attack', true, shot)).toBeNull();
    expect(heldAim('walk', false, shot)).toBeNull();
    expect(heldAim(null, false, shot)).toBeNull();
    facing = pickFacing(move.x, move.y, facing);
    expect(facing).toEqual({ view: 'side', mirror: true });
  });
});
