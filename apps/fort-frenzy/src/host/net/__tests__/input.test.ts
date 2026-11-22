import { describe, expect, it } from 'vitest';
import type { InputTuple } from '../../../shared/messages';
import { PhoneInputSource, tupleToInput } from '../input';

const tuple = (over: Partial<Record<number, number>> = {}): InputTuple => {
  const t: InputTuple = [100, -50, 0, 0, 0, 0, 0, 0, 0, 3, 1, 2];
  for (const [i, v] of Object.entries(over)) t[Number(i)] = v!;
  return t;
};

describe('tupleToInput (tuple v2)', () => {
  it('scales sticks to −1..1 and decodes the flags (index 8)', () => {
    const i = tupleToInput(tuple({ 2: 30, 3: -40, 8: 1 }));
    expect(i.move).toEqual({ x: 1, y: -0.5 });
    expect(i.mainAim).toEqual({ x: 0.3, y: -0.4 });
    expect(i.mainAiming).toBe(true);
    expect(i.superAiming).toBe(false);
    expect(i.buildAiming).toBe(false);
  });

  it('maps the super aim, the build aim and the build-aiming bit (4)', () => {
    const i = tupleToInput(tuple({ 4: -100, 5: 50, 6: 20, 7: -80, 8: 2 | 4 }));
    expect(i.superAim).toEqual({ x: -1, y: 0.5 });
    expect(i.buildAim).toEqual({ x: 0.2, y: -0.8 });
    expect(i.mainAiming).toBe(false);
    expect(i.superAiming).toBe(true);
    expect(i.buildAiming).toBe(true);
  });

  it('maps the counters 9..11 to mainFires, superFires and buildFires', () => {
    const i = tupleToInput(tuple());
    expect([i.mainFires, i.superFires, i.buildFires]).toEqual([3, 1, 2]);
  });
});

describe('PhoneInputSource (§11.4 staleness by receive time)', () => {
  it('is fresh up to 250 ms, then neutral with the counters kept', () => {
    let t = 1000;
    const src = new PhoneInputSource(() => t);
    src.push(tuple({ 8: 1 }));
    t += 250;
    expect(src.sample(0).move.x).toBe(1);
    expect(src.sample(0).mainAiming).toBe(true);
    t += 1; // 251 ms old
    const s = src.sample(0);
    expect(s.move).toEqual({ x: 0, y: 0 });
    expect(s.mainAim).toEqual({ x: 0, y: 0 });
    expect(s.mainAiming).toBe(false);
    expect(s.buildAiming).toBe(false);
    // Counters still apply: the presses that arrived are not lost.
    expect([s.mainFires, s.superFires, s.buildFires]).toEqual([3, 1, 2]);
  });

  it('a late sample with higher counters applies them at once', () => {
    let t = 0;
    const src = new PhoneInputSource(() => t);
    src.push(tuple());
    t = 600;
    expect(src.sample(0).mainFires).toBe(3);
    src.push(tuple({ 0: 0, 1: 0, 9: 4 }));
    expect(src.sample(0).mainFires).toBe(4);
    expect(src.receivedAt).toBe(600);
  });

  it('reads neutral before any sample', () => {
    const src = new PhoneInputSource(() => 0);
    expect(src.sample(0).move).toEqual({ x: 0, y: 0 });
    expect(src.sample(0).mainFires).toBe(0);
  });
});

describe('PhoneInputSource with tuple v2 builds (RD6)', () => {
  it('a held build aim (flag 4) goes neutral after 250 ms; the build counter still applies', () => {
    let t = 0;
    const src = new PhoneInputSource(() => t);
    src.push(tuple({ 6: -60, 7: 80, 8: 4, 11: 5 }));
    t = 250;
    const fresh = src.sample(0);
    expect(fresh.buildAiming).toBe(true);
    expect(fresh.buildAim).toEqual({ x: -0.6, y: 0.8 });
    t = 251;
    const stale = src.sample(0);
    expect(stale.buildAiming).toBe(false);
    expect(stale.buildAim).toEqual({ x: 0, y: 0 });
    expect(stale.move).toEqual({ x: 0, y: 0 });
    expect(stale.buildFires).toBe(5);
    // A late release still lands: the counter grows with its aim.
    src.push(tuple({ 6: -60, 7: 80, 8: 0, 11: 6 }));
    expect(src.sample(0)).toMatchObject({ buildFires: 6, buildAiming: false });
  });

  it('build presses made during a team pause are swallowed', () => {
    const src = new PhoneInputSource(() => 0);
    src.push(tuple({ 11: 2 }));
    src.hold();
    src.push(tuple({ 11: 4 }));
    src.release();
    expect(src.sample(0).buildFires).toBe(2);
    src.push(tuple({ 11: 5 }));
    expect(src.sample(0).buildFires).toBe(3);
  });
});
