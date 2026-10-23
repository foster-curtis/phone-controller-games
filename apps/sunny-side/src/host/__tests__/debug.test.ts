import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../sim';
import { createSim } from '../sim';
import { createDebugSim, debugEnabled } from '../debug';

describe('debugEnabled', () => {
  it('is on in dev or with ?debug=1 only', () => {
    expect(debugEnabled(true, '')).toBe(true);
    expect(debugEnabled(false, '?debug=1')).toBe(true);
    expect(debugEnabled(false, '?code=ABCD&debug=1')).toBe(true);
    expect(debugEnabled(false, '')).toBe(false);
    expect(debugEnabled(false, '?debug=0')).toBe(false);
  });
});

describe('createDebugSim.forceOut', () => {
  function run(sim: ReturnType<typeof createDebugSim>, steps: number): SimEvent[] {
    const events: SimEvent[] = [];
    for (let i = 0; i < steps; i++) events.push(...sim.step());
    return events;
  }

  it('rings the egg out for real; the ghost spawns after the sim delay', () => {
    const sim = createDebugSim(createSim({ seed: 1 }));
    sim.startRound([
      { id: 'p1', frozen: false },
      { id: 'p2', frozen: false },
      { id: 'p3', frozen: false },
    ]);
    // The phone keeps sending neutral input; it must not hold the egg back.
    sim.setInput('p2', [0, 0, 0, 4, 2]);
    run(sim, 5);
    expect(sim.forceOut('p2')).toBe(true);
    sim.setInput('p2', [0, 0, 0, 4, 2]);

    const events = run(sim, 180);
    const out = events.find((e) => e.type === 'eliminated');
    expect(out).toMatchObject({ type: 'eliminated', id: 'p2' });
    expect(
      sim
        .snapshot()
        .eggs.map((e) => e.id)
        .sort(),
    ).toEqual(['p1', 'p3']);

    const later = run(sim, 60 * 6);
    expect(later.some((e) => e.type === 'ghostSpawned' && e.id === 'p2')).toBe(true);
  });

  it('returns false for a player without an egg on the pan', () => {
    const sim = createDebugSim(createSim({ seed: 1 }));
    sim.startRound([{ id: 'p1', frozen: false }]);
    expect(sim.forceOut('nobody')).toBe(false);
  });
});
