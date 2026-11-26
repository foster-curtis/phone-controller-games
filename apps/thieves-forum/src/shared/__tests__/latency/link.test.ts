// The latency simulator itself (SPEC §12.9, BUILD_PLAN TF3): seeded, in order, within its delay bounds.
import { describe, expect, it } from 'vitest';
import { createFakePhone, createLink, type PhoneSend } from './link';

describe('latency link', () => {
  it('draws a base delay in 30–250 ms and keeps every arrival within ±80 ms of it, in order', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const link = createLink<number>({ seed, dropRate: 0 });
      expect(link.baseMs).toBeGreaterThanOrEqual(30);
      expect(link.baseMs).toBeLessThanOrEqual(250);
      let prev = -Infinity;
      for (let i = 0; i < 50; i++) {
        const at = i * 33;
        const arrival = link.send(i, at)!;
        expect(arrival).toBeGreaterThanOrEqual(prev);
        expect(arrival - at).toBeGreaterThanOrEqual(Math.max(0, link.baseMs - 80));
        prev = arrival;
      }
      expect(link.log.map((a) => a.payload)).toEqual([...Array(50).keys()]);
    }
  });

  it('is deterministic per seed', () => {
    const run = (seed: number) => {
      const link = createLink<number>({ seed });
      return [...Array(30).keys()].map((i) => link.send(i, i * 10, true));
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  it('drops only droppable messages', () => {
    const link = createLink<number>({ seed: 3, dropRate: 0.5 });
    let dropped = 0;
    for (let i = 0; i < 100; i++) if (link.send(i, i, true) === null) dropped++;
    for (let i = 100; i < 200; i++) expect(link.send(i, i, false)).not.toBeNull();
    expect(dropped).toBeGreaterThan(20);
  });

  it('take() returns arrivals strictly before t, once', () => {
    const link = createLink<number>({ seed: 1, jitterMs: 0, delayMs: [100, 100] });
    link.send(1, 0);
    link.send(2, 50);
    expect(link.take(100)).toEqual([]);
    expect(link.take(100.001).map((a) => a.payload)).toEqual([1]);
    expect(link.take(1000).map((a) => a.payload)).toEqual([2]);
    expect(link.take(1000)).toEqual([]);
  });

  it('the fake phone samples at 30 Hz while held, 5 Hz idle, and sends every bit change', () => {
    const link = createLink<PhoneSend>({ seed: 1, dropRate: 0, jitterMs: 0, delayMs: [50, 50] });
    const phone = createFakePhone(link);
    phone.at(1000); // idle: 0, 200, …, 1000
    expect(link.log.length).toBe(6);
    phone.setHold(true, 1010);
    phone.at(1510); // held: every 33.3 ms
    const held = link.log.slice(6);
    expect(held.length).toBe(1 + 15);
    expect(held.every((a) => a.payload.t === 'input' && a.payload.hold)).toBe(true);
    phone.setHold(false, 1520);
    const last = link.log.at(-1)!.payload;
    expect(last).toEqual({ t: 'input', hold: false, x: 0, y: 0 });
  });
});
