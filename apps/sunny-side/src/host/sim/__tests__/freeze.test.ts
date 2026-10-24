import { describe, expect, it } from 'vitest';
import { startRadiusFor } from '../arena';
import { egg, maybeEgg, ofType, run, setup, speed } from './helpers';

describe('frozen control', () => {
  it('zeroes velocity once, then ignores stick, dash and slam', () => {
    const { sim, pads } = setup(['a', 'b'], { a: [-150, 0], b: [150, 0] });
    pads.a!.stick(100, 0);
    run(sim, 20);
    expect(speed(egg(sim, 'a'))).toBeGreaterThan(100);

    sim.setFrozen('a', true);
    expect(egg(sim, 'a')).toMatchObject({ vx: 0, vy: 0, frozen: true });
    const x = egg(sim, 'a').x;
    pads.a!.dash().slamDown();
    const events = run(sim, 30);
    expect(ofType(events, 'dash')).toHaveLength(0);
    expect(egg(sim, 'a').slamCharge).toBe(0);
    expect(egg(sim, 'a').x).toBe(x);
    pads.a!.slamUp();
    expect(ofType(run(sim, 5), 'slam')).toHaveLength(0);

    // Presses made while frozen don't fire on unfreeze.
    sim.setFrozen('a', false);
    expect(ofType(run(sim, 5), 'dash')).toHaveLength(0);
    expect(egg(sim, 'a').frozen).toBe(false);
    expect(egg(sim, 'a').x).toBeGreaterThan(x); // steering again
  });

  it('cancels a slam charge without firing it', () => {
    const { sim, pads } = setup(['a', 'b'], { a: [-150, 0], b: [150, 0] });
    pads.a!.slamDown();
    run(sim, 30);
    sim.setFrozen('a', true);
    expect(egg(sim, 'a').slamCharge).toBe(0);
    pads.a!.slamUp();
    sim.setFrozen('a', false);
    expect(ofType(run(sim, 5), 'slam')).toHaveLength(0);
  });

  it('a frozen egg can still be hit (velocity is not re-zeroed) and eliminated', () => {
    const r = startRadiusFor(2);
    const { sim, pads } = setup(['a', 'b'], { a: [r - 200, 0], b: [r - 90, 0] }, { frozen: ['b'] });
    expect(egg(sim, 'b').frozen).toBe(true);
    pads.b!.stick(-100, 0); // ignored
    pads.a!.stick(100, 0).dash();
    let hit = false;
    let movedAfterHit = 0;
    const events = [];
    for (let i = 0; i < 60; i++) {
      const ev = sim.step();
      events.push(...ev);
      if (ofType(ev, 'collision').length) hit = true;
      const b = maybeEgg(sim, 'b');
      if (hit && b && b.vx > 0) movedAfterHit++;
      if (!b) break;
    }
    expect(hit).toBe(true);
    expect(movedAfterHit).toBeGreaterThan(0);
    expect(ofType(events, 'eliminated')).toEqual([
      { type: 'eliminated', id: 'b', by: 'a', byGhost: false, respawnMs: 5000 },
    ]);
  });

  it('setFrozen is a no-op for unknown ids; startRound honours frozen spawns', () => {
    const { sim, pads } = setup(['a', 'b'], {}, { frozen: ['a'] });
    expect(() => sim.setFrozen('zzz', true)).not.toThrow();
    const x = egg(sim, 'a').x;
    pads.a!.stick(100, 0);
    run(sim, 10);
    expect(egg(sim, 'a').x).toBe(x);
    expect(egg(sim, 'b').frozen).toBe(false);
  });
});
