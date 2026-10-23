import { describe, expect, it } from 'vitest';
import { SIM_CONFIG } from '../config';
import { DASH_COOLDOWN_STEPS } from '../egg';
import type { Pad } from './helpers';
import { egg, ofType, parkRow, run, setup } from './helpers';
import type { SimWorld } from '../world';

/** 8-player pan (radius ≈ 509): `a` near the top, everyone else parked in a row at the bottom. */
function big() {
  const rest = ['b', 'c', 'd', 'e', 'f', 'g', 'h'];
  return setup(['a', ...rest], { a: [0, -150], ...parkRow(rest) });
}

/** Dash in a stick direction for one step, then let go of the stick. */
function dashStep(sim: SimWorld, pad: Pad, x: number, y: number) {
  pad.stick(x, y).dash();
  const events = sim.step();
  pad.stick(0, 0);
  return ofType(events, 'dash');
}

describe('dash', () => {
  it('fires only on a dashCount increment (a held bit alone does nothing)', () => {
    const { sim, pads } = big();
    pads.a!.holdDashBit(true);
    expect(ofType(run(sim, 30), 'dash')).toHaveLength(0);
    expect(egg(sim, 'a').vx).toBe(0);

    pads.a!.stick(0, -100).dash();
    expect(ofType(sim.step(), 'dash')).toEqual([{ type: 'dash', id: 'a' }]);
    expect(egg(sim, 'a').vy).toBeLessThan(-SIM_CONFIG.dash.dv * 0.9);
  });

  it('C2 tuning: dash Δv is 960 px/s, and a dash from rest yields ≈ 960 px/s on the next step', () => {
    expect(SIM_CONFIG.dash.dv).toBe(960);
    const { sim, pads } = big();
    pads.a!.stick(100, 0).dash();
    sim.step();
    expect(egg(sim, 'a').vx).toBeGreaterThan(960 * 0.9);
    expect(egg(sim, 'a').vx).toBeLessThanOrEqual(960);
  });

  it('uses facing on a neutral stick', () => {
    const { sim, pads } = big();
    pads.a!.stick(0, 100); // face down (+y)
    sim.step();
    pads.a!.stick(0, 0);
    run(sim, 3);
    const before = egg(sim, 'a');
    pads.a!.dash();
    sim.step();
    const after = egg(sim, 'a');
    expect(after.vy - before.vy).toBeGreaterThan(SIM_CONFIG.dash.dv * 0.9);
    expect(Math.abs(after.vx - before.vx)).toBeLessThan(1);
  });

  it('has a 1.5 s cooldown; presses during it are ignored, not queued', () => {
    expect(DASH_COOLDOWN_STEPS).toBe(90);
    const { sim, pads } = big();
    const a = pads.a!;
    expect(dashStep(sim, a, 100, 0)).toHaveLength(1); // tick D
    expect(egg(sim, 'a').dashCooldown).toBe(1);

    run(sim, 44);
    expect(dashStep(sim, a, -100, 0)).toHaveLength(0); // D+45
    expect(egg(sim, 'a').dashCooldown).toBeCloseTo(0.5, 1);

    run(sim, 43);
    expect(dashStep(sim, a, -100, 0)).toHaveLength(0); // D+89: still cooling down
    expect(egg(sim, 'a').dashCooldown).toBeGreaterThan(0);
    expect(dashStep(sim, a, -100, 0)).toHaveLength(1); // D+90: ready
    expect(ofType(run(sim, 200), 'dash')).toHaveLength(0); // nothing was queued
  });

  it('a counter jump of more than 1 in one step is one dash', () => {
    const { sim, pads } = big();
    pads.a!.stick(100, 0).dash(3);
    expect(ofType(sim.step(), 'dash')).toHaveLength(1);
    pads.a!.stick(0, 0);
    expect(ofType(run(sim, 200), 'dash')).toHaveLength(0);
  });

  it('a counter going backwards (phone reload) re-baselines without a dash', () => {
    const { sim, pads } = big();
    const a = pads.a!;
    a.dashCount = 5;
    a.send();
    sim.step(); // a +5 jump: one dash
    run(sim, 100);
    a.dashCount = 0;
    a.send();
    expect(ofType(sim.step(), 'dash')).toHaveLength(0);
    expect(dashStep(sim, a, -100, 0)).toHaveLength(1);
  });
});
