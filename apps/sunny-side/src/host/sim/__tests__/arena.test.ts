import { describe, expect, it } from 'vitest';
import { HOLD_STEPS, SHRINK_STEPS, arenaAt, minRadiusFor, startRadiusFor } from '../arena';
import { SimWorld } from '../world';
import { egg, maybeEgg, ofType, run, setup } from './helpers';

describe('arena', () => {
  it('start radius strictly increases with player count', () => {
    const sim = new SimWorld();
    let prev = 0;
    for (let n = 1; n <= 8; n++) {
      expect(startRadiusFor(n)).toBeGreaterThan(prev);
      sim.startRound(Array.from({ length: n }, (_, i) => ({ id: `p${i}`, frozen: true })));
      const snap = sim.snapshot();
      expect(snap.arena.startRadius).toBe(startRadiusFor(n));
      expect(snap.arena.radius).toBe(startRadiusFor(n));
      expect(snap.eggs).toHaveLength(n);
      prev = startRadiusFor(n);
    }
  });

  it('shrink timeline: constant 10 s → warning flag → linear 45 s to the minimum → hold', () => {
    expect(HOLD_STEPS).toBe(600);
    expect(SHRINK_STEPS).toBe(2700);
    const r0 = startRadiusFor(4);
    const min = minRadiusFor(r0);
    expect(min).toBeCloseTo(r0 * 0.4);
    for (const t of [0, 1, 300, 600])
      expect(arenaAt(t, r0)).toEqual({ radius: r0, shrinking: false });
    expect(arenaAt(601, r0).shrinking).toBe(true);
    // Linear: equal radius drops per step, midpoint halfway.
    const d1 = arenaAt(700, r0).radius - arenaAt(701, r0).radius;
    const d2 = arenaAt(3000, r0).radius - arenaAt(3001, r0).radius;
    expect(d1).toBeGreaterThan(0);
    expect(d1).toBeCloseTo(d2, 9);
    expect(arenaAt(600 + 1350, r0).radius).toBeCloseTo((r0 + min) / 2);
    expect(arenaAt(3299, r0).shrinking).toBe(true);
    for (const t of [3300, 4000, 100_000]) {
      expect(arenaAt(t, r0)).toEqual({ radius: min, shrinking: false });
    }
  });

  it('the sim follows the timeline and emits shrinkStart once', () => {
    const sim = new SimWorld();
    sim.startRound([{ id: 'a', frozen: true }]);
    sim.place('a', 0, 0);
    const events = [];
    const radii: number[] = [];
    const flags: boolean[] = [];
    for (let i = 0; i < 3400; i++) {
      events.push(...sim.step().map((e) => ({ ...e, tick: sim.snapshot().tick })));
      radii.push(sim.snapshot().arena.radius);
      flags.push(sim.snapshot().arena.shrinking);
    }
    const starts = events.filter((e) => e.type === 'shrinkStart');
    expect(starts).toHaveLength(1);
    expect(starts[0]!.tick).toBe(601);
    expect(flags[599]).toBe(false); // tick 600
    expect(flags[600]).toBe(true); // tick 601
    expect(radii[599]).toBe(startRadiusFor(1));
    expect(flags[3299]).toBe(false); // tick 3300: holding at the minimum
    expect(radii[3399]).toBeCloseTo(minRadiusFor(startRadiusFor(1)));
  });

  it('ring-out happens only when the center passes the radius', () => {
    const r = startRadiusFor(2);
    // Most of a's body hangs over the rim; its center is 1 px inside.
    const { sim } = setup(['a', 'b'], { a: [r - 1, 0], b: [0, 150] }, { frozen: ['a', 'b'] });
    expect(sim.snapshot().arena.radius).toBe(r);
    expect(ofType(run(sim, 5), 'eliminated')).toHaveLength(0);
    expect(egg(sim, 'a').x).toBeCloseTo(r - 1);
    sim.place('a', r + 0.5, 0);
    const out = ofType(sim.step(), 'eliminated');
    expect(out).toEqual([
      { type: 'eliminated', id: 'a', by: null, byGhost: false, respawnMs: 5000 },
    ]);
    expect(maybeEgg(sim, 'a')).toBeUndefined();
  });

  it('spawn placement depends on the seed', () => {
    const a = new SimWorld({ seed: 1 });
    const b = new SimWorld({ seed: 2 });
    const spawns = [
      { id: 'x', frozen: false },
      { id: 'y', frozen: false },
    ];
    a.startRound(spawns);
    b.startRound(spawns);
    expect(a.snapshot().eggs[0]!.x).not.toBeCloseTo(b.snapshot().eggs[0]!.x);
    for (const e of a.snapshot().eggs) {
      expect(Math.hypot(e.x, e.y)).toBeLessThan(a.snapshot().arena.radius - e.radius);
    }
  });
});
