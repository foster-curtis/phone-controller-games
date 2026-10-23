import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUTTON_DASH, BUTTON_SLAM, type InputTuple } from '../../shared/messages';
import { createChargeArc, createHoldButton } from '../input/buttons';
import { createHoldToPause } from '../input/holdToPause';
import { computeStick, createJoystick, STICK_RADIUS_PX } from '../input/joystick';
import { createInputSender } from '../input/sender';
import { pointer } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  document.body.innerHTML = '';
});
afterEach(() => vi.useRealTimers());

describe('joystick', () => {
  it('uses the first touch point as origin, clamps to the radius, applies the deadzone, sends ints', () => {
    const zone = document.createElement('div');
    document.body.append(zone);
    const out: Array<[number, number]> = [];
    createJoystick(zone, { onChange: (x, y) => out.push([x, y]) });

    pointer(zone, 'pointerdown', 1, 300, 200);
    pointer(zone, 'pointermove', 1, 305, 200); // inside deadzone
    expect(out).toEqual([]);
    pointer(zone, 'pointermove', 1, 300 + STICK_RADIUS_PX / 2, 200);
    expect(out.at(-1)).toEqual([50, 0]);
    pointer(zone, 'pointermove', 1, 300 + STICK_RADIUS_PX * 5, 200); // far beyond radius
    expect(out.at(-1)).toEqual([100, 0]);
    pointer(zone, 'pointermove', 1, 300, 200 - STICK_RADIUS_PX * 3);
    expect(out.at(-1)).toEqual([0, -100]);
    for (const [x, y] of out) {
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(100.5);
    }
    pointer(zone, 'pointerup', 1, 300, 200);
    expect(out.at(-1)).toEqual([0, 0]);
  });

  it('ignores other pointers while one is active', () => {
    const zone = document.createElement('div');
    document.body.append(zone);
    const out: Array<[number, number]> = [];
    createJoystick(zone, { onChange: (x, y) => out.push([x, y]) });
    pointer(zone, 'pointerdown', 1, 0, 0);
    pointer(zone, 'pointerdown', 2, 500, 500);
    pointer(zone, 'pointermove', 2, 600, 500);
    expect(out).toEqual([]);
  });

  it('computeStick normalizes diagonals and never returns -0', () => {
    expect(computeStick(0, 0)).toEqual([0, 0]);
    const [x, y] = computeStick(1000, 1000);
    expect(Math.hypot(x, y)).toBeCloseTo(100, 0);
    expect(Object.is(computeStick(-1, 0)[0], -0)).toBe(false);
  });
});

describe('input sender', () => {
  function setup() {
    const sent: InputTuple[] = [];
    const sender = createInputSender((t) => sent.push(t));
    sender.start();
    sent.length = 0;
    return { sent, sender };
  }

  it('sends the stick on change at no more than 30 Hz', () => {
    const { sent, sender } = setup();
    vi.advanceTimersByTime(30); // past the gap since start
    for (let i = 1; i <= 100; i++) {
      sender.setStick(i % 100, 0);
      vi.advanceTimersByTime(5);
    }
    // 500 ms of changes every 5 ms → at most 30 Hz → ≤ 15 (+1 boundary)
    expect(sent.length).toBeGreaterThan(5);
    expect(sent.length).toBeLessThanOrEqual(16);
  });

  it('sends button edges immediately, ignoring the stick cap', () => {
    const { sent, sender } = setup();
    sender.setStick(10, 0);
    sender.setButton(BUTTON_DASH, true);
    sender.setButton(BUTTON_DASH, false);
    expect(sent.map((t) => t[2])).toContain(BUTTON_DASH);
    expect(sent.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps alive at 5 Hz when idle', () => {
    const { sent } = setup();
    vi.advanceTimersByTime(1000);
    expect(sent.length).toBe(5);
  });

  it('counters are monotonic and bump once per press', () => {
    const { sent, sender } = setup();
    sender.setButton(BUTTON_DASH, true);
    sender.setButton(BUTTON_DASH, true); // held: no new press
    sender.setButton(BUTTON_DASH, false);
    sender.setButton(BUTTON_DASH, true);
    sender.setButton(BUTTON_SLAM, true);
    sender.neutral();
    vi.advanceTimersByTime(600);
    const dash = sent.map((t) => t[3]);
    const slam = sent.map((t) => t[4]);
    expect([...dash].sort((a, b) => a - b)).toEqual(dash);
    expect([...slam].sort((a, b) => a - b)).toEqual(slam);
    expect(dash.at(-1)).toBe(2);
    expect(slam.at(-1)).toBe(1);
  });

  it('stays quiet when stopped', () => {
    const { sent, sender } = setup();
    sender.stop();
    sender.setStick(50, 50);
    sender.setButton(BUTTON_DASH, true);
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([]);
  });
});

describe('multi-touch', () => {
  it('joystick and a button work at the same time (separate pointerIds)', () => {
    const sent: InputTuple[] = [];
    const sender = createInputSender((t) => sent.push(t));
    sender.start();
    const zone = document.createElement('div');
    const dash = document.createElement('div');
    document.body.append(zone, dash);
    createJoystick(zone, { onChange: (x, y) => sender.setStick(x, y) });
    createHoldButton(dash, (d) => sender.setButton(BUTTON_DASH, d));

    pointer(zone, 'pointerdown', 1, 100, 100);
    vi.advanceTimersByTime(40);
    pointer(zone, 'pointermove', 1, 100 + STICK_RADIUS_PX, 100);
    pointer(dash, 'pointerdown', 2, 600, 100);
    expect(sender.tuple()).toEqual([100, 0, BUTTON_DASH, 1, 0]);
    pointer(zone, 'pointerup', 1, 0, 0);
    expect(sender.tuple().slice(0, 3)).toEqual([0, 0, BUTTON_DASH]);
    pointer(dash, 'pointerup', 2, 0, 0);
    expect(sender.tuple().slice(0, 3)).toEqual([0, 0, 0]);
  });
});

describe('hold to pause', () => {
  it('fires at 600 ms', () => {
    const el = document.createElement('button');
    const onPause = vi.fn();
    createHoldToPause(el, onPause);
    pointer(el, 'pointerdown', 1);
    vi.advanceTimersByTime(599);
    expect(onPause).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('is cancelled by a release at 500 ms, and the ring fills while held', () => {
    const el = document.createElement('button');
    const onPause = vi.fn();
    createHoldToPause(el, onPause);
    pointer(el, 'pointerdown', 1);
    vi.advanceTimersByTime(300);
    expect(Number(el.style.getPropertyValue('--progress'))).toBeGreaterThan(0.4);
    vi.advanceTimersByTime(200);
    pointer(el, 'pointerup', 1);
    vi.advanceTimersByTime(1000);
    expect(onPause).not.toHaveBeenCalled();
    expect(el.style.getPropertyValue('--progress')).toBe('0');
  });
});

describe('SLAM charge arc', () => {
  it('arc sweep/thickness tracks hold time and resets on release', () => {
    const host = document.createElement('div');
    const charge = createChargeArc(host, 1000);
    const svg = charge.svg;
    expect(svg.hasAttribute('hidden')).toBe(true);
    charge.press();
    vi.advanceTimersByTime(500);
    const midThick = Number(svg.dataset.thickness);
    expect(Number(svg.dataset.endAngle)).toBeCloseTo(-15, -1);
    vi.advanceTimersByTime(2000);
    expect(Number(svg.dataset.endAngle)).toBeCloseTo(60, 5);
    expect(Number(svg.dataset.thickness)).toBeGreaterThan(midThick);
    charge.release();
    expect(svg.hasAttribute('hidden')).toBe(true);
    expect(svg.dataset.charge).toBe('0');
  });
});
