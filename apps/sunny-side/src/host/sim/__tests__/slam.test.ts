import { describe, expect, it } from 'vitest';
import { SIM_CONFIG } from '../config';
import { MASS_BOOST_STEPS, SLAM_CHARGE_STEPS } from '../egg';
import { egg, ofType, parkRow, run, setup, speed } from './helpers';

function big() {
  const rest = ['b', 'c', 'd', 'e', 'f', 'g', 'h'];
  return setup(['a', ...rest], { a: [0, -150], ...parkRow(rest) });
}

/** Face +x, charge for `steps` on a neutral stick, release; returns Δv and the slam event. */
function slamAfter(steps: number) {
  const { sim, pads } = big();
  const a = pads.a!;
  a.stick(100, 0);
  sim.step();
  a.stick(0, 0).slamDown();
  run(sim, steps);
  const before = egg(sim, 'a');
  a.slamUp();
  const events = sim.step();
  const after = egg(sim, 'a');
  return { sim, dv: after.vx - before.vx, slam: ofType(events, 'slam')[0], before };
}

describe('slam', () => {
  it('charge (0..1) is in the snapshot, caps at 1 s, and raises the max-charge flag', () => {
    expect(SLAM_CHARGE_STEPS).toBe(60);
    const { sim, pads } = big();
    pads.a!.slamDown();
    sim.step();
    expect(egg(sim, 'a').slamCharge).toBeCloseTo(1 / 60);
    run(sim, 29);
    expect(egg(sim, 'a').slamCharge).toBeCloseTo(0.5);
    expect(egg(sim, 'a').slamMax).toBe(false);
    run(sim, 29);
    expect(egg(sim, 'a').slamCharge).toBeLessThan(1);
    expect(egg(sim, 'a').slamMax).toBe(false);
    sim.step(); // 60 steps held = 1 s
    expect(egg(sim, 'a').slamCharge).toBe(1);
    expect(egg(sim, 'a').slamMax).toBe(true);
    run(sim, 60);
    expect(egg(sim, 'a').slamCharge).toBe(1);
    pads.a!.slamUp();
    sim.step();
    expect(egg(sim, 'a').slamCharge).toBe(0);
    expect(egg(sim, 'a').slamMax).toBe(false);
  });

  it('reduces the steering force while charging', () => {
    const plain = big();
    plain.pads.a!.stick(100, 0);
    run(plain.sim, 20);
    const charging = big();
    charging.pads.a!.stick(100, 0).slamDown();
    run(charging.sim, 20);
    const ratio = speed(egg(charging.sim, 'a')) / speed(egg(plain.sim, 'a'));
    expect(ratio).toBeCloseTo(SIM_CONFIG.steer.chargingFactor, 2);
  });

  it('the release impulse increases with charge (and stops increasing at the cap)', () => {
    const results = [0, 10, 30, 59, 60, 90].map((n) => slamAfter(n));
    const dvs = results.map((r) => r.dv);
    for (let i = 1; i < 5; i++) expect(dvs[i]!).toBeGreaterThan(dvs[i - 1]!);
    expect(dvs[5]!).toBeCloseTo(dvs[4]!, 0);
    expect(results[4]!.slam).toEqual({ type: 'slam', id: 'a', charge: 1, max: true });
    expect(results[2]!.slam!.max).toBe(false);
    expect(results[2]!.slam!.charge).toBeCloseTo(0.5);
    // Neutral stick → along facing (+x).
    expect(dvs[4]!).toBeGreaterThan(SIM_CONFIG.slam.maxDv * 0.9);
  });

  it('a tap between samples (count up, bit already down) is a zero-charge slam', () => {
    const { sim, pads } = big();
    const a = pads.a!;
    a.slamCount += 1;
    a.send();
    const slams = ofType(sim.step(), 'slam');
    expect(slams).toEqual([{ type: 'slam', id: 'a', charge: 0, max: false }]);
  });

  it('the mass boost lasts 0.3 s and then restores the original mass', () => {
    expect(MASS_BOOST_STEPS).toBe(18);
    const { sim, pads } = big();
    const body = sim.bodyOf('a')!;
    const original = body.mass;
    pads.a!.slamDown();
    run(sim, 30);
    expect(body.mass).toBe(original);
    pads.a!.slamUp();
    sim.step(); // release step: boosted for this physics step and the next 17
    expect(egg(sim, 'a').massBoost).toBe(true);
    expect(body.mass).toBeCloseTo(original * SIM_CONFIG.slam.massBoost);
    run(sim, 17);
    expect(egg(sim, 'a').massBoost).toBe(true);
    sim.step();
    expect(egg(sim, 'a').massBoost).toBe(false);
    expect(body.mass).toBe(original);
    expect(sim.originalMassOf('a')).toBe(original);
  });

  it('back-to-back slams never stack the boost', () => {
    const { sim, pads } = big();
    const body = sim.bodyOf('a')!;
    const original = body.mass;
    pads.a!.slamDown();
    sim.step();
    pads.a!.slamUp();
    sim.step();
    pads.a!.slamDown();
    sim.step();
    pads.a!.slamUp();
    sim.step();
    expect(body.mass).toBeCloseTo(original * SIM_CONFIG.slam.massBoost);
    run(sim, 30);
    expect(body.mass).toBe(original);
  });
});
