import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInputSender } from '../src/sender';
import { createHoldButton } from '../src/widgets/holdButton';
import { createHoldToConfirm } from '../src/widgets/holdToConfirm';
import { computeStick, createJoystick, STICK_RADIUS_PX } from '../src/widgets/joystick';
import { createNearestRouter } from '../src/widgets/nearestRouter';
import { pointer, setRect } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  document.body.innerHTML = '';
});
afterEach(() => vi.useRealTimers());

function zone(): HTMLElement {
  const z = document.createElement('div');
  document.body.append(z);
  return z;
}

describe('joystick', () => {
  it('uses the first touch as origin, clamps to the radius, applies the dead zone, sends ints', () => {
    const z = zone();
    const out: Array<[number, number]> = [];
    createJoystick(z, { onChange: (x, y) => out.push([x, y]) });
    pointer(z, 'pointerdown', 1, 300, 200);
    pointer(z, 'pointermove', 1, 305, 200); // inside the dead zone
    expect(out).toEqual([]);
    pointer(z, 'pointermove', 1, 300 + STICK_RADIUS_PX / 2, 200);
    expect(out.at(-1)).toEqual([50, 0]);
    pointer(z, 'pointermove', 1, 300 + STICK_RADIUS_PX * 5, 200);
    expect(out.at(-1)).toEqual([100, 0]);
    pointer(z, 'pointerup', 1, 300, 200);
    expect(out.at(-1)).toEqual([0, 0]);
  });

  it('ignores other pointers while one is active', () => {
    const z = zone();
    const out: Array<[number, number]> = [];
    createJoystick(z, { onChange: (x, y) => out.push([x, y]) });
    pointer(z, 'pointerdown', 1, 0, 0);
    pointer(z, 'pointerdown', 2, 500, 500);
    pointer(z, 'pointermove', 2, 600, 500);
    expect(out).toEqual([]);
  });

  it('takes radius, dead zone and scale as parameters', () => {
    expect(computeStick(0, 0)).toEqual([0, 0]);
    expect(computeStick(6, 0, 60, 0.12)).toEqual([0, 0]); // 10% < 12%
    expect(computeStick(8, 0, 60, 0.12)).toEqual([13, 0]);
    expect(computeStick(30, 0, 60, 0.12)).toEqual([50, 0]);
    expect(computeStick(1000, 0, 60, 0.12, 127)).toEqual([127, 0]);
    expect(Object.is(computeStick(-1, 0)[0], -0)).toBe(false);
  });

  it('idle opacity, ease-back and touch callbacks', () => {
    const z = zone();
    const touches: boolean[] = [];
    const stick = createJoystick(z, {
      idleOpacity: 0.4,
      easeBackMs: 150,
      onChange: () => {},
      onTouch: (d) => touches.push(d),
    });
    const base = z.querySelector('.stick-base') as HTMLElement;
    expect(base.style.opacity).toBe('0.4');
    expect(base.classList.contains('resting')).toBe(true);
    pointer(z, 'pointerdown', 1, 50, 60);
    expect(base.style.opacity).toBe('1');
    expect(base.style.transition).toMatch(/0s/);
    expect(stick.active()).toBe(true);
    pointer(z, 'pointerup', 1, 50, 60);
    expect(base.style.opacity).toBe('0.4');
    expect(base.style.transition).toMatch(/150ms/);
    expect(base.classList.contains('resting')).toBe(true);
    expect(touches).toEqual([true, false]);
    stick.destroy();
    expect(z.querySelector('.stick-base')).toBeNull();
  });

  it('leaves opacity and transitions to CSS when unset', () => {
    const z = zone();
    createJoystick(z, { onChange: () => {} });
    const base = z.querySelector('.stick-base') as HTMLElement;
    pointer(z, 'pointerdown', 1, 0, 0);
    pointer(z, 'pointerup', 1, 0, 0);
    expect(base.style.opacity).toBe('');
    expect(base.style.transition).toBe('');
  });
});

describe('hold button', () => {
  it('multi-touch: joystick and a button at the same time', () => {
    const sender = createInputSender(
      {
        layout: ['x', 'y', 'b', 'n'],
        analog: ['x', 'y'],
        counters: ['n'],
        buttons: { slot: 'b', presses: { 1: 'n' } },
        mode: { kind: 'onChange' },
      },
      () => {},
    );
    sender.start();
    const z = zone();
    const btn = zone();
    createJoystick(z, { onChange: (x, y) => sender.update({ x, y }) });
    const hold = createHoldButton(btn, (d) => sender.setButton(1, d));
    pointer(z, 'pointerdown', 1, 100, 100);
    pointer(z, 'pointermove', 1, 100 + STICK_RADIUS_PX, 100);
    pointer(btn, 'pointerdown', 2, 600, 100);
    expect(sender.tuple()).toEqual([100, 0, 1, 1]);
    expect(btn.classList.contains('pressed')).toBe(true);
    pointer(btn, 'pointerdown', 3, 600, 100); // second finger on the same button: no new press
    pointer(btn, 'pointerup', 2, 0, 0);
    expect(hold.isDown()).toBe(true);
    pointer(btn, 'pointerup', 3, 0, 0);
    expect(hold.isDown()).toBe(false);
    expect(sender.tuple()).toEqual([100, 0, 0, 1]);
  });
});

describe('nearest-center router', () => {
  function pads() {
    const container = zone();
    const make = (x: number) => {
      const z = document.createElement('div');
      const btn = document.createElement('div');
      z.append(btn);
      container.append(z);
      setRect(btn, x, 100, 60, 60);
      const downs: number[] = [];
      const hold = createHoldButton(z, (d) => d && downs.push(1));
      return { zone: z, btn, hold, downs };
    };
    const a = make(100); // center (130, 130)
    const b = make(200); // center (230, 130)
    return { container, a, b };
  }

  it('routes a press in one zone to the nearer button', () => {
    const { container, a, b } = pads();
    createNearestRouter(container, [a, b]);
    pointer(a.zone, 'pointerdown', 1, 190, 130); // in A's zone, nearer B
    expect(a.downs).toEqual([]);
    expect(b.downs).toEqual([1]);
    pointer(a.zone, 'pointerdown', 2, 150, 130); // nearer A: passes through
    expect(a.downs).toEqual([1]);
  });

  it('hit slop: a press just outside every zone goes to the nearest button within the slop', () => {
    const { container, a, b } = pads();
    createNearestRouter(container, [a, b], { hitSlop: 8 });
    pointer(container, 'pointerdown', 1, 266, 130); // 6 px right of B's edge
    expect(b.downs).toEqual([1]);
    pointer(container, 'pointerdown', 2, 100, 92); // 8 px above A's corner
    expect(a.downs).toEqual([1]);
    pointer(container, 'pointerdown', 3, 400, 130); // too far
    expect(a.downs.length + b.downs.length).toBe(2);
  });

  it('without slop, misses stay misses', () => {
    const { container, a, b } = pads();
    createNearestRouter(container, [a, b]);
    pointer(container, 'pointerdown', 1, 266, 130);
    expect(a.downs.length + b.downs.length).toBe(0);
  });
});

describe('hold to confirm', () => {
  it('confirms at the hold time and fills --progress', () => {
    const el = document.createElement('button');
    const ok = vi.fn();
    createHoldToConfirm(el, ok);
    pointer(el, 'pointerdown', 1);
    expect(el.classList.contains('holding')).toBe(true);
    vi.advanceTimersByTime(300);
    expect(Number(el.style.getPropertyValue('--progress'))).toBeGreaterThan(0.4);
    vi.advanceTimersByTime(299);
    expect(ok).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(el.style.getPropertyValue('--progress')).toBe('0');
  });

  it('an early release cancels; holdMs is a parameter', () => {
    const el = document.createElement('button');
    const ok = vi.fn();
    createHoldToConfirm(el, ok, { holdMs: 1000 });
    pointer(el, 'pointerdown', 1);
    vi.advanceTimersByTime(900);
    pointer(el, 'pointerup', 1);
    vi.advanceTimersByTime(1000);
    expect(ok).not.toHaveBeenCalled();
    expect(el.classList.contains('holding')).toBe(false);
  });
});
