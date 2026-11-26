// RD10-fix-4 (SPEC §9, the map-edge wall): no forced move (knockback, separation) takes an enemy's
// body off the field, and a push never takes one that is still outside (walking in from a portal)
// further out. Its own walking is never held, so portal spawns still enter.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { mapV1 } from '../../../content/map';
import { mine } from '../../../content/balance';
import type { ClassId, EnemyId, PortalId } from '../../../shared/ids';
import { edgeWall } from '../movement';
import type { EnemyEnt } from '../types';
import { harness, type Harness } from './harness';

const COLS = mapV1.cols;
const ROWS = mapV1.rows;
/** An enemy kind's feet radius. */
const radius = (kind: EnemyId) => content.enemies.find((d) => d.id === kind)!.radius;
const steps = (ms: number) => Math.max(1, Math.round((ms * 60) / 1000));

/** A lone knight in an empty, open combat (no wave spawns). */
function fight(classId: ClassId): Harness {
  const h = harness(1, 1, { classes: [classId] });
  h.toCombat();
  h.holdSpawns();
  return h;
}

/** A tough enemy that stands still, so only forced moves shift it. */
function foe(h: Harness, kind: EnemyId, x: number, y: number): EnemyEnt {
  const e = h.sim.spawnEnemy(kind, x, y);
  e.hp = e.maxHp = 1e6;
  e.stats.moveSpeed = 0;
  return e;
}

const inside = (e: EnemyEnt) =>
  e.x >= e.r - 1e-9 && e.x <= COLS - e.r + 1e-9 && e.y >= e.r - 1e-9 && e.y <= ROWS - e.r + 1e-9;

/** Runs `n` steps; the enemy's body stays on the field at every one. Returns how close it came. */
function staysIn(h: Harness, e: EnemyEnt, n = 90): number {
  let closest = Infinity;
  for (let i = 0; i < n; i++) {
    h.sim.step();
    expect(inside(e)).toBe(true);
    closest = Math.min(closest, e.x - e.r, COLS - e.r - e.x, e.y - e.r, ROWS - e.r - e.y);
  }
  return closest;
}

/**
 * One case per edge: the knight stands `gap` tiles in from the enemy, which stands just inside the
 * edge, between him and the edge (top edge: clear of the Citadel, cols 16–19).
 */
const EDGES = [
  {
    edge: 'left',
    at: (gap: number, r: number) => ({
      e: { x: r + 0.05, y: 6 },
      k: { x: r + 0.05 + gap, y: 6 },
      aim: { x: -1, y: 0 },
    }),
  },
  {
    edge: 'right',
    at: (gap: number, r: number) => ({
      e: { x: COLS - r - 0.05, y: 6 },
      k: { x: COLS - r - 0.05 - gap, y: 6 },
      aim: { x: 1, y: 0 },
    }),
  },
  {
    edge: 'top',
    at: (gap: number, r: number) => ({
      e: { x: 6, y: r + 0.05 },
      k: { x: 6, y: r + 0.05 + gap },
      aim: { x: 0, y: -1 },
    }),
  },
  {
    edge: 'bottom',
    at: (gap: number, r: number) => ({
      e: { x: 6, y: ROWS - r - 0.05 },
      k: { x: 6, y: ROWS - r - 0.05 - gap },
      aim: { x: 0, y: 1 },
    }),
  },
] as const;

describe('edgeWall (one axis)', () => {
  it('stops a move at the edge, holds one that starts outside, lets anything inward through', () => {
    expect(edgeWall(5, 7, 0.3, 9.7)).toBe(7);
    expect(edgeWall(9, 10.5, 0.3, 9.7)).toBe(9.7);
    expect(edgeWall(1, -2, 0.3, 9.7)).toBe(0.3);
    // Outside: held against an outward push, free to come in.
    expect(edgeWall(-0.6, -1.5, 0.3, 9.7)).toBe(-0.6);
    expect(edgeWall(-0.6, -0.2, 0.3, 9.7)).toBe(-0.2);
    expect(edgeWall(10.6, 11, 0.3, 9.7)).toBe(10.6);
    expect(edgeWall(10.6, 10.1, 0.3, 9.7)).toBe(10.1);
  });
});

describe('the Commander’s shield bash at each edge', () => {
  for (const { edge, at } of EDGES) {
    it(`${edge}: the bashed enemy ends up against the wall, never past it`, () => {
      const h = fight('commander');
      const c = at(1.3, radius('grunt'));
      h.put(0, c.k.x, c.k.y);
      const e = foe(h, 'grunt', c.e.x, c.e.y);
      h.pads[0]!.tap('mainFires', { mainAim: c.aim });
      h.sim.step();
      expect(e.hp).toBeLessThan(e.maxHp);
      expect(inside(e)).toBe(true);
      // It reached the wall (the knockback alone would have taken it off the field).
      expect(staysIn(h, e)).toBeLessThan(1e-9);
    });
  }
});

describe('every other knockback source near an edge', () => {
  for (const { edge, at } of EDGES) {
    it(`${edge}: the Ranger’s shockwave`, () => {
      const h = fight('ranger');
      const c = at(1.6, radius('grunt'));
      h.put(0, c.k.x, c.k.y);
      const e = foe(h, 'grunt', c.e.x, c.e.y);
      h.p(0).superCharge = 1;
      h.pads[0]!.tap('superFires');
      h.sim.step();
      expect(e.hp).toBeLessThan(e.maxHp);
      expect(inside(e)).toBe(true);
      expect(staysIn(h, e)).toBeLessThan(1e-9);
    });

    it(`${edge}: a mine burst`, () => {
      const h = fight('ranger');
      const c = at(0.7, radius('grunt'));
      // Place the mine where the knight stands, arm it, then send him away.
      h.put(0, c.k.x, c.k.y);
      h.p(0).meter = 1;
      h.pads[0]!.tap('buildFires');
      h.run(1);
      h.put(0, 20, 12);
      h.run(steps(mine.armMs) + 1);
      const e = foe(h, 'grunt', c.e.x, c.e.y);
      let burst = false;
      for (let i = 0; i < 120 && !burst; i++) {
        h.sim.step();
        burst = h.events('mineBurst').length > 0;
        expect(inside(e)).toBe(true);
      }
      expect(burst).toBe(true);
      expect(e.hp).toBeLessThan(e.maxHp);
      expect(staysIn(h, e)).toBeLessThan(1e-9);
    });
  }

  it('any push, on every enemy type, Flyers included, at every edge', () => {
    const kinds: EnemyId[] = ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'];
    for (const kind of kinds) {
      for (const { at } of EDGES) {
        const h = fight('ranger');
        h.put(0, 20, 12);
        const c = at(1, radius(kind));
        const e = foe(h, kind, c.e.x, c.e.y);
        // A hard shove straight at the edge (about 6 tiles under the decay).
        e.push = { x: (c.e.x - c.k.x) * 40, y: (c.e.y - c.k.y) * 40 };
        expect(staysIn(h, e, 60)).toBeLessThan(1e-9);
      }
    }
  });

  it('separation in a packed crowd against the edge keeps every body on the field', () => {
    const h = fight('ranger');
    h.put(0, 20, 12);
    const pack = Array.from({ length: 8 }, () => foe(h, 'swarm', 0.2, 6));
    pack.push(...Array.from({ length: 4 }, () => foe(h, 'grunt', 0.4, 6.1)));
    for (let i = 0; i < 60; i++) {
      h.sim.step();
      for (const e of pack) expect(inside(e)).toBe(true);
    }
  });
});

describe('enemies outside the field (portal spawns)', () => {
  it('a push never takes one further out; inward and along the edge still move it', () => {
    const h = fight('ranger');
    h.put(0, 20, 12);
    const left = foe(h, 'grunt', -0.6, 12);
    const below = foe(h, 'grunt', 10, 24.6);
    left.push = { x: -30, y: 6 };
    below.push = { x: 0, y: 30 };
    h.sim.step();
    expect(left.x).toBe(-0.6);
    expect(left.y).toBeGreaterThan(12);
    expect(below.y).toBe(24.6);
    left.push = { x: 30, y: 0 };
    h.sim.step();
    expect(left.x).toBeGreaterThan(-0.6);
  });

  it('a shield bash from inside, at an enemy still outside, never pushes it further out', () => {
    const h = fight('commander');
    h.put(0, 0.9, 12);
    const e = foe(h, 'grunt', -0.6, 12);
    h.pads[0]!.tap('mainFires', { mainAim: { x: -1, y: 0 } });
    let minX = e.x;
    for (let i = 0; i < 60; i++) {
      h.sim.step();
      minX = Math.min(minX, e.x);
    }
    expect(e.hp).toBeLessThan(e.maxHp);
    expect(minX).toBe(-0.6);
  });

  it('an enemy spawned at each portal still walks into the field, a stacked pack too', () => {
    for (const id of Object.keys(mapV1.portals) as PortalId[]) {
      const { spawn } = mapV1.portals[id];
      const h = fight('ranger');
      h.put(0, 20, 3);
      const grunt = h.sim.spawnEnemy('grunt', spawn.x, spawn.y);
      const pack = Array.from({ length: 8 }, () => h.sim.spawnEnemy('swarm', spawn.x, spawn.y));
      expect(inside(grunt)).toBe(false);
      h.until(() => inside(grunt) && pack.every(inside), 60 * 6);
    }
  });
});
