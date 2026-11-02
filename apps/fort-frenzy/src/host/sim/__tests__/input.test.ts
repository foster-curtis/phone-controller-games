// Input sources and press counters (SPEC §11.4 freshness, §15.3 counters and baselines).
import { describe, expect, it } from 'vitest';
import { rules } from '../../../content/base';
import { createSim, FreshInputSource, neutralInput, ScriptedInputSource } from '../index';
import type { PlayerInput } from '../types';
import { harness, startOf } from './harness';

const STALE = Math.round((rules.inputStaleMs / 1000) * 60);

function input(patch: Partial<PlayerInput>): PlayerInput {
  return { ...neutralInput(), ...patch };
}

describe('input freshness', () => {
  it('input older than 250 ms is neutral: sticks zeroed, buttons released, counters kept', () => {
    const src = new FreshInputSource(rules.inputStaleMs);
    const live = input({
      move: { x: 1, y: 0 },
      mainAim: { x: 0.5, y: 0.5 },
      mainAiming: true,
      radialOpen: true,
      radialSlot: 2,
      mainFires: 4,
      actionTaps: 2,
    });
    src.push(live, 100);
    expect(src.sample(100 + STALE)).toEqual(live);
    const stale = src.sample(100 + STALE + 1);
    expect(stale).toEqual({ ...neutralInput(), mainFires: 4, actionTaps: 2 });
    src.push(input({ move: { x: 0, y: 1 }, mainFires: 4, actionTaps: 2 }), 200);
    expect(src.sample(201).move).toEqual({ x: 0, y: 1 });
  });

  it('a dropped phone never leaves its character running', () => {
    const src = new FreshInputSource(rules.inputStaleMs);
    const sim = createSim(startOf(1), { sources: new Map([[0, src]]) });
    while (sim.world.phase !== 'build') sim.step();
    const p = sim.world.players[0]!;
    src.push(input({ move: { x: 1, y: 0 } }), sim.world.tick);
    sim.step();
    const x0 = p.x;
    for (let i = 0; i < 60; i++) sim.step();
    const moved = p.x - x0;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(((STALE + 1) / 60) * 4.5 + 0.01);
    const x1 = p.x;
    for (let i = 0; i < 30; i++) sim.step();
    expect(p.x).toBe(x1);
  });
});

describe('press counters', () => {
  function fires(h: ReturnType<typeof harness>, n = 1) {
    return h.collect('attack', n).filter((e) => e.slot === 'main').length;
  }

  it('the first sample only baselines the counters', () => {
    const pad = new ScriptedInputSource();
    pad.set({ mainFires: 7, actionTaps: 3 });
    const sim = createSim(startOf(1), { sources: new Map([[0, pad]]) });
    let shots = 0;
    while (sim.world.phase !== 'build') sim.step();
    for (const p of sim.world.players) sim.command({ c: 'ready', slot: p.slot, ready: true });
    for (let i = 0; i < 5; i++) {
      sim.step();
      shots += sim.world.events.filter((e) => e.e === 'attack').length;
    }
    expect(sim.world.phase).toBe('combat');
    expect(shots).toBe(0);
    pad.tap('mainFires');
    sim.step();
    expect(sim.world.events.filter((e) => e.e === 'attack')).toHaveLength(1);
  });

  it('counters re-baseline after a reconnect and when they go backwards', () => {
    const h = harness(1);
    h.toCombat();
    h.holdSpawns();
    const pad = h.pads[0]!;
    pad.tap('mainFires');
    expect(fires(h)).toBe(1);
    h.run(60);

    // Disconnected: presses while away never fire, nor on the first sample back.
    h.sim.command({ c: 'presence', slot: 0, connected: false });
    h.run(1);
    pad.set({ mainFires: pad.input.mainFires + 5 });
    h.run(3);
    h.sim.command({ c: 'presence', slot: 0, connected: true });
    expect(fires(h, 3)).toBe(0);
    pad.tap('mainFires');
    expect(fires(h)).toBe(1);
    h.run(60);

    // A phone reload restarts its counters: going backwards re-baselines without firing.
    pad.set({ mainFires: 0 });
    expect(fires(h, 3)).toBe(0);
    pad.tap('mainFires');
    expect(fires(h)).toBe(1);
  });
});
