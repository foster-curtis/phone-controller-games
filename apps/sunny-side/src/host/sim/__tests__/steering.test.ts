import { describe, expect, it } from 'vitest';
import { egg, ofType, run, setup, speed } from './helpers';

describe('steering', () => {
  it('is a force: speed builds over steps and decays on a neutral stick', () => {
    const { sim, pads } = setup(['a', 'b'], { a: [-150, 0], b: [0, 180] });
    pads.a!.stick(100, 0);
    const speeds: number[] = [];
    for (let i = 0; i < 30; i++) {
      sim.step();
      speeds.push(speed(egg(sim, 'a')));
    }
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]!).toBeGreaterThan(speeds[i - 1]!);
    expect(speeds[0]!).toBeLessThan(speeds[29]! / 5); // not an instant velocity
    expect(speeds[29]!).toBeLessThan(320); // bounded by air friction (terminal ≈ 300 px/s)

    pads.a!.stick(0, 0);
    let prev = speeds[29]!;
    for (let i = 0; i < 60; i++) {
      sim.step();
      const s = speed(egg(sim, 'a'));
      expect(s).toBeLessThan(prev);
      prev = s;
    }
    expect(prev).toBeLessThan(speeds[29]! * 0.1);
  });

  it('updates facing to the last non-zero stick direction', () => {
    const { sim, pads } = setup(['a', 'b'], { a: [-100, 0], b: [100, 0] });
    pads.a!.stick(0, 100);
    sim.step();
    expect(egg(sim, 'a').angle).toBeCloseTo(Math.PI / 2);
    pads.a!.stick(0, 0);
    run(sim, 5);
    expect(egg(sim, 'a').angle).toBeCloseTo(Math.PI / 2);
  });

  it("a hit egg's knockback is not overwritten by its own input over the next 10 steps", () => {
    const { sim, pads } = setup(['a', 'b'], { a: [-150, 0], b: [-40, 0] });
    pads.b!.stick(-100, 0); // b steers straight at its attacker the whole time
    pads.a!.stick(100, 0).dash();
    let hitAt = -1;
    for (let i = 0; i < 20 && hitAt < 0; i++) {
      if (ofType(sim.step(), 'collision').length > 0) hitAt = i;
    }
    expect(hitAt).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 10; i++) {
      expect(egg(sim, 'b').vx, `step ${i} after the hit`).toBeGreaterThan(0);
      sim.step();
    }
  });
});
