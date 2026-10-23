import { describe, expect, it } from 'vitest';
import type { InputTuple } from '../../../shared/messages';
import { createSim } from '../index';
import { createSim as createSimFromTypes } from '../types';
import type { Sim, SimEvent, SimSnapshot } from '../types';

const IDS = ['p1', 'p2', 'p3', 'p4', 'p5'];

/** A fixed pseudo-random input script (independent of Math.random). */
function script(steps: number): Map<number, [string, InputTuple][]> {
  let s = 12345;
  const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32;
  const counters = new Map(IDS.map((id) => [id, { dash: 0, slam: 0, slamHeld: false }]));
  const out = new Map<number, [string, InputTuple][]>();
  for (let t = 0; t < steps; t++) {
    const list: [string, InputTuple][] = [];
    for (const id of IDS) {
      if (rnd() > 0.15) continue;
      const c = counters.get(id)!;
      if (rnd() < 0.1) c.dash += 1;
      if (rnd() < 0.3) {
        c.slamHeld = !c.slamHeld;
        if (c.slamHeld) c.slam += 1;
      }
      const x = Math.round((rnd() * 2 - 1) * 100);
      const y = Math.round((rnd() * 2 - 1) * 100);
      list.push([id, [x, y, c.slamHeld ? 2 : 0, c.dash, c.slam]]);
    }
    out.set(t, list);
  }
  return out;
}

function play(sim: Sim, steps: number): { snaps: SimSnapshot[]; events: SimEvent[][] } {
  const plan = script(steps);
  sim.startRound(IDS.map((id, i) => ({ id, frozen: i === 4 })));
  const snaps: SimSnapshot[] = [sim.snapshot()];
  const events: SimEvent[][] = [];
  for (let t = 0; t < steps; t++) {
    for (const [id, input] of plan.get(t) ?? []) sim.setInput(id, input);
    if (t === 120) sim.setFrozen('p5', false);
    if (t === 900) sim.setFrozen('p2', true);
    events.push(sim.step());
    snaps.push(sim.snapshot());
  }
  return { snaps, events };
}

describe('determinism', () => {
  it('identical input sequences produce identical snapshots and events', () => {
    const steps = 1500;
    const a = play(createSim({ seed: 42 }), steps);
    const b = play(createSimFromTypes({ seed: 42 }), steps);
    expect(b.snaps).toEqual(a.snaps);
    expect(b.events).toEqual(a.events);
    // The script actually exercised the mechanics.
    const types = new Set(a.events.flat().map((e) => e.type));
    for (const t of ['dash', 'slam', 'collision', 'eliminated', 'ghostSpawned', 'pulse'] as const) {
      expect(types.has(t), t).toBe(true);
    }
  });

  it('snapshots are fresh copies', () => {
    const sim = createSim({ seed: 1 });
    sim.startRound([{ id: 'a', frozen: false }]);
    const s1 = sim.snapshot();
    s1.eggs[0]!.x = 9999;
    s1.arena.radius = 1;
    expect(sim.snapshot().eggs[0]!.x).not.toBe(9999);
    expect(sim.snapshot().arena.radius).not.toBe(1);
    sim.destroy();
  });
});
