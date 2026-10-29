import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInputSender, type InputSchema } from '../src/sender';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
});
afterEach(() => vi.useRealTimers());

const DASH = 1;
const SLAM = 2;
/** Sunny Side's layout: [x, y, buttons, dash, slam]. */
const onChangeSchema: InputSchema<'x' | 'y' | 'buttons' | 'dash' | 'slam'> = {
  layout: ['x', 'y', 'buttons', 'dash', 'slam'],
  analog: ['x', 'y'],
  counters: ['dash', 'slam'],
  buttons: { slot: 'buttons', presses: { [DASH]: 'dash', [SLAM]: 'slam' } },
  mode: { kind: 'onChange' },
};

type FfSlot = 'moveX' | 'moveY' | 'mainX' | 'mainY' | 'flags' | 'mainFires' | 'radialSlot';
/** A Fort Frenzy-like layout (trimmed). */
const fixedSchema: InputSchema<FfSlot> = {
  layout: ['moveX', 'moveY', 'mainX', 'mainY', 'flags', 'mainFires', 'radialSlot'],
  analog: ['moveX', 'moveY', 'mainX', 'mainY'],
  counters: ['mainFires'],
  buttons: { slot: 'flags' },
  initial: { radialSlot: -1 },
  mode: { kind: 'fixedRate' },
};

function setup<K extends string>(schema: InputSchema<K>) {
  const sent: number[][] = [];
  const sender = createInputSender(schema, (t) => sent.push(t));
  sender.start();
  sent.length = 0;
  return { sent, sender };
}

describe('onChange mode (Sunny Side)', () => {
  it('sends sticks on change at no more than 30 Hz', () => {
    const { sent, sender } = setup(onChangeSchema);
    vi.advanceTimersByTime(30);
    for (let i = 1; i <= 100; i++) {
      sender.update({ x: i % 100, y: 0 });
      vi.advanceTimersByTime(5);
    }
    expect(sent.length).toBeGreaterThan(5);
    expect(sent.length).toBeLessThanOrEqual(16);
  });

  it('sends button edges immediately; counters bump once per press', () => {
    const { sent, sender } = setup(onChangeSchema);
    sender.update({ x: 10, y: 0 });
    sender.setButton(DASH, true);
    sender.setButton(DASH, true); // held: no new press
    sender.setButton(DASH, false);
    sender.setButton(SLAM, true);
    expect(sent.map((t) => t[2])).toEqual([DASH, 0, SLAM]);
    expect(sender.tuple()).toEqual([10, 0, SLAM, 1, 1]);
  });

  it('keeps alive at 5 Hz when idle and stays quiet when stopped', () => {
    const { sent, sender } = setup(onChangeSchema);
    vi.advanceTimersByTime(1000);
    expect(sent.length).toBe(5);
    sender.stop();
    sender.update({ x: 50 });
    sender.setButton(DASH, true);
    vi.advanceTimersByTime(1000);
    expect(sent.length).toBe(5);
  });

  it('neutral zeroes everything but the counters', () => {
    const { sent, sender } = setup(onChangeSchema);
    sender.update({ x: 40, y: -20 });
    sender.setButton(DASH, true);
    sender.neutral();
    expect(sent.at(-1)).toEqual([0, 0, 0, 1, 0]);
  });
});

describe('fixedRate mode (Fort Frenzy SPEC §15.6)', () => {
  it('sends at 5 Hz while idle', () => {
    const { sent } = setup(fixedSchema);
    vi.advanceTimersByTime(1000);
    expect(sent.length).toBe(5);
  });

  it('sends at 30 Hz while any control is touched, even with the thumb held still', () => {
    const { sent, sender } = setup(fixedSchema);
    sender.touch('stick', true); // sends now, then every 33 ms
    sender.update({ moveX: 60, moveY: 0 });
    expect(sent.length).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(sent.length).toBeGreaterThanOrEqual(30);
    expect(sent.length).toBeLessThanOrEqual(32);
    expect(sent.at(-1)!.slice(0, 2)).toEqual([60, 0]);
    // A second touch keeps 30 Hz; releasing both drops back to 5 Hz (the release goes out at once).
    sender.touch('main', true);
    sender.touch('stick', false);
    const n = sent.length;
    vi.advanceTimersByTime(1000);
    expect(sent.length - n).toBeGreaterThanOrEqual(30);
    sender.update({ moveX: 0 });
    sender.touch('main', false);
    expect(sent.at(-1)![0]).toBe(0);
    const m = sent.length;
    vi.advanceTimersByTime(1000);
    expect(sent.length - m).toBe(5);
  });

  it('analog changes wait for the next tick; edges go out immediately', () => {
    const { sent, sender } = setup(fixedSchema);
    sender.update({ moveX: 10 });
    expect(sent.length).toBe(0);
    sender.setButton(1, true); // main aiming flag
    expect(sent.length).toBe(1);
    expect(sent[0]).toEqual([10, 0, 0, 0, 1, 0, -1]);
    sender.update({ radialSlot: 2 }); // discrete value = edge
    expect(sent.length).toBe(2);
    // A fire and its aim arrive together.
    sender.bump('mainFires', { mainX: 50, mainY: -50, flags: 0 });
    expect(sent.at(-1)).toEqual([10, 0, 50, -50, 0, 1, 2]);
  });

  it('neutral restores initial values (radialSlot −1) and keeps counters', () => {
    const { sent, sender } = setup(fixedSchema);
    sender.touch('stick', true);
    sender.bump('mainFires', { mainX: 30, radialSlot: 1 });
    sender.neutral();
    expect(sent.at(-1)).toEqual([0, 0, 0, 0, 0, 1, -1]);
    // Touches were cleared: back to 5 Hz.
    const n = sent.length;
    vi.advanceTimersByTime(1000);
    expect(sent.length - n).toBe(5);
  });

  it('stop cancels the cadence', () => {
    const { sent, sender } = setup(fixedSchema);
    sender.touch('stick', true);
    sender.stop();
    const n = sent.length;
    vi.advanceTimersByTime(1000);
    expect(sent.length).toBe(n);
    expect(sender.running).toBe(false);
  });

  it('rejects unknown slots', () => {
    const { sender } = setup(fixedSchema);
    expect(() => sender.update({ nope: 1 } as never)).toThrow(/unknown slot/);
  });
});
