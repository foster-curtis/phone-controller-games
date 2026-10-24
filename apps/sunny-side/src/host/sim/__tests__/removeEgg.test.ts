import { describe, expect, it } from 'vitest';
import { egg, makeGhost, maybeEgg, ofType, pushOut, run, setup } from './helpers';

const place = { a: [-120, 0], b: [120, 0], c: [0, 150] } as Record<string, [number, number]>;

describe('Sim.removeEgg', () => {
  it('removes the egg at once, with no eliminated event, no credit and no ghost', () => {
    const { sim, pads } = setup(['a', 'b', 'c'], place);
    // b touched a just before: removal still gives nobody credit.
    pads.b!.stick(-100, 0).dash();
    let hit = false;
    for (let i = 0; i < 30 && !hit; i++) hit = ofType(sim.step(), 'collision').length > 0;
    expect(hit).toBe(true);
    pads.b!.stick(0, 0);

    sim.removeEgg('a');
    expect(maybeEgg(sim, 'a')).toBeUndefined();
    expect(sim.bodyOf('a')).toBeUndefined();
    const events = run(sim, 400);
    expect(events.filter((e) => 'id' in e && e.id === 'a')).toEqual([]);
    expect(ofType(events, 'eliminated')).toEqual([]);
    expect(sim.snapshot().ghosts).toEqual([]);
    expect(sim.snapshot().eggs.map((e) => e.id)).toEqual(['b', 'c']);
  });

  it('frees its space: another egg moves through where it was without a collision', () => {
    const { sim, pads } = setup(['a', 'b', 'c'], place);
    sim.removeEgg('a');
    pads.b!.stick(-100, 0);
    const events = run(sim, 75);
    expect(egg(sim, 'b').x).toBeLessThan(-140);
    expect(ofType(events, 'collision')).toEqual([]);
  });

  it("removes the player's ghost", () => {
    const { sim } = setup(['a', 'b', 'c'], place);
    makeGhost(sim, 'c');
    expect(sim.snapshot().ghosts.map((g) => g.id)).toEqual(['c']);
    sim.removeEgg('c');
    expect(sim.snapshot().ghosts).toEqual([]);
    expect(sim.bodyOf('c')).toBeUndefined();
    expect(ofType(run(sim, 300), 'pulse')).toEqual([]);
  });

  it('cancels a pending ghost spawn', () => {
    const { sim } = setup(['a', 'b', 'c'], place);
    expect(ofType(pushOut(sim, 'c'), 'eliminated')).toHaveLength(1);
    run(sim, 100);
    sim.removeEgg('c');
    const events = run(sim, 400);
    expect(ofType(events, 'ghostSpawned')).toEqual([]);
    expect(sim.snapshot().ghosts).toEqual([]);
  });

  it('is a no-op for unknown ids and idempotent', () => {
    const { sim } = setup(['a', 'b', 'c'], place);
    const before = sim.snapshot();
    sim.removeEgg('nobody');
    expect(sim.snapshot()).toEqual(before);
    sim.removeEgg('a');
    const once = sim.snapshot();
    sim.removeEgg('a');
    expect(sim.snapshot()).toEqual(once);
    expect(() => run(sim, 5)).not.toThrow();
  });

  it('ignores later input for the removed id', () => {
    const { sim, pads } = setup(['a', 'b', 'c'], place);
    sim.removeEgg('a');
    pads.a!.stick(100, 0).dash();
    const events = run(sim, 30);
    expect(ofType(events, 'dash')).toEqual([]);
    expect(maybeEgg(sim, 'a')).toBeUndefined();
  });
});
