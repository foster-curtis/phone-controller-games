// The ground flow field is built once per run (SPEC §7.3, §15.5): nothing a player places changes
// pathing, so no combat start, wave jump or Hunter re-pricing rebuilds it.
import { describe, expect, it, vi } from 'vitest';
import type * as Flowfield from '../../systems/flowfield';
import type { FlowField } from '../types';

const calls = vi.hoisted(() => ({ into: [] as (FlowField | undefined)[] }));

vi.mock('../../systems/flowfield', async (orig) => {
  const real = await orig<typeof Flowfield>();
  return {
    ...real,
    buildField: (...args: Parameters<typeof real.buildField>) => {
      calls.into.push(args[3]);
      return real.buildField(...args);
    },
  };
});

const { harness } = await import('./harness');

describe('ground field', () => {
  it('is built exactly once over a run of several waves', () => {
    calls.into.length = 0;
    const h = harness(2, 7);
    const ground = h.sim.world.fields.ground;
    h.sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
    for (let wave = 0; wave < 3; wave++) {
      h.toCombat();
      // Some Hunters, so their per-player fields get built too (those are allowed).
      h.sim.spawnEnemy('hunter', 5.5, 20.5);
      h.run(240);
      h.sim.world.spawns.length = 0;
      for (const e of h.sim.world.enemies) e.hp = 0;
      h.until(() => h.sim.world.phase === 'build', 60 * 10);
    }
    h.sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: 9 });
    h.run(2);
    h.toCombat();
    h.run(60);
    expect(calls.into.filter((f) => f === ground)).toHaveLength(1);
    // Hunted fields were built (into their own buffers), so the spy saw the other calls.
    expect(calls.into.length).toBeGreaterThan(1);
  });
});
