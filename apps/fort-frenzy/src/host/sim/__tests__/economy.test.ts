// Carry slowdown and death drops (SPEC §3.4, §6). Crate buying, giving and delivery by input are gone.
import { describe, expect, it } from 'vitest';
import { ranger } from '../../../content/balance';
import { harness } from './harness';

describe('carry slowdown and death drops', () => {
  it('carry slowdown grows faster than linearly with crates carried', () => {
    const dist: number[] = [];
    for (let n = 0; n <= ranger.carryCap; n++) {
      const h = harness(1);
      h.toBuild();
      h.put(0, 4, 10);
      h.p(0).crates = n;
      h.pads[0]!.set({ move: { x: 1, y: 0 } });
      h.run(60);
      dist.push(h.p(0).x - 4);
    }
    expect(dist[0]).toBeCloseTo(ranger.moveSpeed, 1);
    for (let n = 1; n < dist.length; n++) expect(dist[n]).toBeLessThan(dist[n - 1]!);
    const loss = dist.map((d, n) => (n === 0 ? 0 : dist[n - 1]! - d));
    for (let n = 2; n < loss.length; n++) expect(loss[n]).toBeGreaterThan(loss[n - 1]!);
    expect(dist[1]! / dist[0]!).toBeGreaterThan(0.94); // barely noticeable
    expect(dist[ranger.carryCap]! / dist[0]!).toBeLessThan(0.75); // a real slowdown
  });

  it('a player who dies drops every crate they carried', () => {
    const h = harness(1);
    h.toCombat();
    h.holdSpawns();
    h.put(0, 10, 12);
    const p = h.p(0);
    p.crates = 3;
    p.hp = 5;
    h.sim.spawnEnemy('grunt', 10, 12.6);
    h.until(() => p.respawnAt !== null, 600);
    expect(p.crates).toBe(0);
    expect(h.sim.world.cratePiles).toEqual([expect.objectContaining({ n: 3, lockedSlot: null })]);
    expect(p.run.deaths).toBe(1);
  });
});
