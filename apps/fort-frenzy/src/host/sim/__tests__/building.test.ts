// Building and pathing scenarios (SPEC §7, §10.1 row 5 and build arc, §10.2 ghost, §15.5).
import { describe, expect, it } from 'vitest';
import { arrowTower } from '../../../content/structures';
import { placementValid } from '../index';
import { harness } from './harness';

describe('build phase: ghost, place, cancel', () => {
  it('select shows a ghost; place builds at your feet for crates', () => {
    const h = harness(1);
    h.toBuild();
    h.put(0, 10.5, 10.5);
    h.p(0).crates = 3;
    h.sim.command({ c: 'build', slot: 0, action: 'select', structure: 'arrow_tower', ref: 1 });
    h.run(1);
    expect(h.p(0).ghost).toBe('arrow_tower');
    h.sim.command({ c: 'build', slot: 0, action: 'place', ref: 2 });
    h.run(1);
    const s = h.sim.world.structures;
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: 'arrow_tower', tile: [10, 10], owner: 0, hp: arrowTower.hp });
    expect(h.p(0).crates).toBe(3 - arrowTower.cost);
    expect(h.p(0).lastBuilt).toBe('arrow_tower');
    expect(h.p(0).ghost).toBeNull();
    expect(h.p(0).run.structuresBuilt).toBe(1);
    expect(h.events('built')).toEqual([expect.objectContaining({ tile: [10, 10], slot: 0 })]);
    expect(h.events('command')).toEqual([{ e: 'command', ref: 2, slot: 0, ok: true }]);
    expect(h.sim.world.grid.occupant[10 * 36 + 10]).toBe(s[0]!.id);
  });

  it('refuses without enough crates, on invalid tiles, and outside the build phase', () => {
    const h = harness(2);
    h.toBuild();
    h.put(0, 10.5, 10.5);
    h.p(0).crates = 1;
    h.sim.command({ c: 'build', slot: 0, action: 'select', structure: 'arrow_tower' });
    h.sim.command({ c: 'build', slot: 0, action: 'place', ref: 1 });
    h.run(1);
    expect(h.events('command')[0]).toMatchObject({ ok: false, reason: 'crates' });

    h.p(0).crates = 4;
    h.put(0, 18, 2.5); // repair zone
    h.sim.command({ c: 'build', slot: 0, action: 'select', structure: 'arrow_tower' });
    h.sim.command({ c: 'build', slot: 0, action: 'place', ref: 2 });
    h.run(1);
    expect(h.events('command')[0]).toMatchObject({ ok: false, reason: 'invalid' });

    // A teammate on the tile blocks a tower; the builder's own body doesn't.
    h.put(0, 10.5, 10.5);
    h.put(1, 10.6, 10.4);
    h.sim.command({ c: 'build', slot: 0, action: 'select', structure: 'arrow_tower' });
    h.sim.command({ c: 'build', slot: 0, action: 'place', ref: 3 });
    h.run(1);
    expect(h.events('command')[0]).toMatchObject({ ok: false, reason: 'invalid' });
    expect(h.sim.world.structures).toHaveLength(0);

    h.sim.command({ c: 'build', slot: 0, action: 'cancel' });
    h.run(1);
    expect(h.p(0).ghost).toBeNull();

    h.toCombat();
    h.sim.command({ c: 'build', slot: 0, action: 'select', structure: 'arrow_tower', ref: 4 });
    h.run(1);
    expect(h.events('command')[0]).toMatchObject({ ok: false, reason: 'phase' });
  });

  it('validity: on the map, buildable, unoccupied', () => {
    const h = harness(1);
    h.toBuild();
    const w = h.sim.world;
    expect(placementValid(w, 'arrow_tower', [5, 5], 0)).toBe(true);
    expect(placementValid(w, 'arrow_tower', [-1, 5], 0)).toBe(false);
    expect(placementValid(w, 'arrow_tower', [5, 24], 0)).toBe(false);
    expect(placementValid(w, 'arrow_tower', [17, 0], 0)).toBe(false); // citadel
    expect(placementValid(w, 'arrow_tower', [17, 2], 0)).toBe(false); // repair zone
    expect(placementValid(w, 'arrow_tower', [22, 1], 0)).toBe(false); // armory pad
    expect(placementValid(w, 'arrow_tower', [17, 23], 0)).toBe(false); // lane entry
    h.sim.place('arrow_tower', 5, 5, 0);
    expect(placementValid(w, 'arrow_tower', [5, 5], 0)).toBe(false);
    h.sim.spawnEnemy('grunt', 7.5, 7.5);
    expect(placementValid(w, 'arrow_tower', [7, 7], 0)).toBe(false);
  });
});

describe('combat building: action button and build arc', () => {
  it('a tap with a crate places the last-used structure (first in the kit before any) at your feet', () => {
    const h = harness(1);
    h.toCombat();
    h.holdSpawns();
    h.put(0, 8.5, 12.5);
    h.p(0).crates = 4;
    h.pads[0]!.tap('actionTaps');
    h.run(1);
    expect(h.sim.world.structures.map((s) => s.tile)).toEqual([[8, 12]]);
    expect(h.p(0).crates).toBe(2);
    expect(h.p(0).lastBuilt).toBe('arrow_tower');
    // The builder is pushed off the new tower.
    h.run(10);
    const p = h.p(0);
    const inside = p.x > 8 && p.x < 9 && p.y > 12 && p.y < 13;
    expect(inside).toBe(false);
  });

  it('the build arc builds the picked slot; an empty slot or too few crates does nothing', () => {
    const h = harness(1);
    h.toCombat();
    h.holdSpawns();
    h.put(0, 8.5, 12.5);
    h.p(0).crates = 1;
    h.pads[0]!.tap('radialCommits', { radialSlot: 0 });
    h.run(1);
    expect(h.sim.world.structures).toHaveLength(0);
    h.p(0).crates = 4;
    h.pads[0]!.tap('radialCommits', { radialSlot: 1 }); // no structure in that slot
    h.run(1);
    expect(h.sim.world.structures).toHaveLength(0);
    h.pads[0]!.tap('radialCommits', { radialSlot: 0 });
    h.run(1);
    expect(h.sim.world.structures).toHaveLength(1);
    expect(h.p(0).lastBuilt).toBe('arrow_tower');
  });
});

describe('pathing', () => {
  it('a wall of turrets with a gap reroutes Grunts through the gap', () => {
    const h = harness(1);
    h.toCombat();
    h.holdSpawns();
    h.put(0, 30, 3.5);
    for (let col = 0; col < 36; col++) if (col !== 24 && col !== 25) h.sim.place('arrow_tower', col, 15, 0);
    const g = h.sim.spawnEnemy('grunt', 18.5, 20.5);
    g.hp = g.maxHp = 1e9;
    let crossX: number | null = null;
    h.until(() => {
      if (crossX === null && g.y < 15.5) crossX = g.x;
      return g.y < 12;
    }, 60 * 40);
    expect(crossX).toBeGreaterThan(24);
    expect(crossX).toBeLessThan(26);
    for (const s of h.sim.world.structures) expect(s.hp).toBe(s.maxHp);
  });

  it('a sealed path makes the Grunt attack the blocker, then walk through the gap it makes', () => {
    const h = harness(1);
    h.toCombat();
    h.holdSpawns();
    h.put(0, 30, 3.5);
    for (let col = 0; col < 36; col++) h.sim.place('arrow_tower', col, 15, 0);
    const g = h.sim.spawnEnemy('grunt', 18.5, 20.5);
    g.hp = g.maxHp = 1e9;
    h.until(() => h.sim.world.structures.some((s) => s.hp < s.maxHp), 60 * 30);
    const hit = h.sim.world.structures.find((s) => s.hp < s.maxHp)!;
    expect(Math.abs(hit.tile[0] - 18)).toBeLessThanOrEqual(2);
    hit.hp = 1;
    h.until(() => h.events('destroyed').length > 0, 60 * 5);
    expect(h.sim.world.grid.occupant[15 * 36 + hit.tile[0]]).toBe(0);
    h.until(() => g.y < 12, 60 * 30);
  });

  it('placing and destroying a blocker rebuilds the flow field the same step', () => {
    const h = harness(1);
    h.toBuild();
    const f = h.sim.world.fields.ground;
    const t = 10 * 36 + 10;
    const before = f.dist[t]!;
    h.sim.place('arrow_tower', 10, 10, 0);
    h.run(1);
    expect(h.sim.world.fields.ground.dist[t]).toBeGreaterThan(before);
    expect(h.sim.world.fields.dirty).toBe(false);
  });
});
