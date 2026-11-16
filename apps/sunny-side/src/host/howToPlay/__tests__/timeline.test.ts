import { describe, expect, it } from 'vitest';
import { card1Script } from '../card1';
import {
  backOut,
  countdownDigit,
  easeInOutCubic,
  easeInOutQuad,
  easeOutQuad,
  loopTime,
  phase,
  pulse,
  stepAt,
  track,
} from '../timeline';
import { assertClean, createFakeScene } from './fakeScene';

describe('timeline', () => {
  it('tracks numbers, clamped outside the keys', () => {
    const f = track([
      [100, 10],
      [200, 20],
      [300, 0],
    ]);
    expect(f(0)).toBe(10);
    expect(f(150)).toBe(15);
    expect(f(250)).toBe(10);
    expect(f(999)).toBe(0);
  });

  it('tracks points and applies the destination key ease', () => {
    const f = track([
      [0, { x: 0, y: 0 }],
      [100, { x: 100, y: 50 }, easeOutQuad],
    ]);
    expect(f(50).x).toBeCloseTo(75);
    expect(f(50).y).toBeCloseTo(37.5);
    expect(f(100)).toEqual({ x: 100, y: 50 });
  });

  it('eases hit 0 and 1 at the ends; back-out overshoots', () => {
    for (const e of [easeOutQuad, easeInOutQuad, easeInOutCubic, backOut]) {
      expect(e(0)).toBeCloseTo(0);
      expect(e(1)).toBeCloseTo(1);
    }
    expect(backOut(0.8)).toBeGreaterThan(1);
  });

  it('phase, pulse and loopTime', () => {
    expect(phase(5, 10, 20)).toBe(0);
    expect(phase(15, 10, 20)).toBe(0.5);
    expect(phase(25, 10, 20)).toBe(1);
    expect(pulse(15, 10, 20)).toBe(1);
    expect(pulse(10, 10, 20)).toBe(0);
    expect(pulse(30, 10, 20)).toBe(0);
    expect(loopTime(4500, 4000)).toBe(500);
    expect(loopTime(-100, 4000)).toBe(3900);
  });

  it('steps discrete states', () => {
    const steps = [
      [0, 'a'],
      [500, 'b'],
    ] as const;
    expect(stepAt(-1, steps)).toBe('a');
    expect(stepAt(500, steps)).toBe('b');
    expect(countdownDigit(0, 100, 800, 3)).toBeNull();
    expect(countdownDigit(100, 100, 800, 3)).toBe(3);
    expect(countdownDigit(1000, 100, 800, 3)).toBe(2);
    expect(countdownDigit(1800, 100, 800, 3)).toBe(1);
    expect(countdownDigit(2500, 100, 800, 3)).toBeNull();
  });
});

describe('fake scene harness', () => {
  it('runs the card 1 script through create, draw and destroy cleanly', () => {
    const fake = createFakeScene();
    const rig = card1Script.create(fake.scene);
    expect(fake.objects.length).toBeGreaterThan(0);
    for (const t of [0, 1000, card1Script.stillMs, card1Script.loopMs - 1]) rig.draw(t);
    expect(() => assertClean(fake)).toThrow();
    rig.destroy();
    assertClean(fake);
  });

  it('reports leaked listeners, timers and tweens', () => {
    const fake = createFakeScene();
    const s = fake.scene;
    s.events.on('update', () => {});
    s.time.addEvent({});
    s.tweens.add({ targets: {}, x: 1 });
    expect(fake.listeners['events']).toBe(1);
    expect(fake.live).toEqual({ timers: 1, tweens: 1 });
    expect(() => assertClean(fake)).toThrow();
    s.events.off('update');
    expect(fake.listeners['events']).toBe(0);
  });
});
