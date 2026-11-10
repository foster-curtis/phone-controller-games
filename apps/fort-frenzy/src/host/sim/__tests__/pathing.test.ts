// C3 enemy-motion fixes (FF10-fix-1; SPEC §9, §15.5): walkers on the v1 map head for the Citadel on
// a direct diagonal from every open lane (no L-shaped route up the field and along the back), and a
// Wasp flies its unobstructed route with steady progress, never stepping backward.
import { describe, expect, it } from 'vitest';
import { mapV1 } from '../../../content/map';
import { rectDist } from '../geometry';
import type { EnemyEnt } from '../types';
import { harness, type Harness } from './harness';

const LANES = Object.entries(mapV1.lanes) as [string, (typeof mapV1.lanes)['bottom']][];

/** Combat on wave 1 with no spawns, no sentries, and the player parked out of every lane's way. */
function quiet(): Harness {
  const h = harness(1, 3);
  h.toCombat();
  h.holdSpawns();
  h.sim.world.base.archers.count = 0;
  h.put(0, 1.5, 22.5);
  return h;
}

const BASE = { x0: 16, y0: 0, x1: 20, y1: 2 };

/** Walks `e` until it reaches the Citadel (or `max` steps); the points it passed inside the map. */
function walk(h: Harness, e: EnemyEnt, max = 60 * 60): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < max && e.ai !== 'attack'; i++) {
    h.run(1);
    const inside = e.x >= 0 && e.y >= 0 && e.x <= mapV1.cols && e.y <= mapV1.rows;
    if (inside) pts.push({ x: e.x, y: e.y });
  }
  return pts;
}

function shape(pts: readonly { x: number; y: number }[]) {
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const [ux, uy] = [(b.x - a.x) / L, (b.y - a.y) / L];
  let length = 0;
  let maxDev = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]!;
    length += Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y);
    maxDev = Math.max(maxDev, Math.abs((p.x - a.x) * uy - (p.y - a.y) * ux));
  }
  return { straight: L, length, maxDev };
}

describe('ground paths to the Citadel (C3)', () => {
  for (const [lane, def] of LANES) {
    it(`${lane} lane: a Grunt walks a near-straight line to the Citadel`, () => {
      const h = quiet();
      const e = h.sim.spawnEnemy('grunt', def.spawn.x, def.spawn.y);
      const pts = walk(h, e);
      expect(e.ai).toBe('attack');
      const s = shape(pts);
      expect(s.length).toBeLessThanOrEqual(s.straight * 1.1);
      expect(s.maxDev).toBeLessThan(1);
    });
  }

  it('still routes round a wall line through its gap', () => {
    const h = quiet();
    for (let c = 0; c < 36; c++) if (c !== 4) h.sim.place('wall', c, 10, 0);
    h.run(1);
    const e = h.sim.spawnEnemy('grunt', mapV1.lanes.bottom.spawn.x, mapV1.lanes.bottom.spawn.y);
    const pts = walk(h, e);
    expect(e.ai).toBe('attack');
    expect(h.sim.world.structures.every((s) => s.hp === s.maxHp)).toBe(true);
    const crossing = pts.find((p, i) => i > 0 && pts[i - 1]!.y >= 11 && p.y < 11)!;
    expect(Math.floor(crossing.x)).toBe(4);
  });
});

describe('Wasp motion (C3)', () => {
  for (const [lane, def] of LANES) {
    it(`${lane} lane: progress toward the Citadel is monotone, no step reverses`, () => {
      const h = quiet();
      const f = h.sim.spawnEnemy('flyer', def.spawn.x, def.spawn.y);
      let px = f.x;
      let py = f.y;
      let pd = rectDist(f.x, f.y, BASE);
      let dir: { x: number; y: number } | null = null;
      for (let i = 0; i < 60 * 30 && f.ai !== 'attack'; i++) {
        h.run(1);
        const dx = f.x - px;
        const dy = f.y - py;
        const d = rectDist(f.x, f.y, BASE);
        expect(d).toBeLessThanOrEqual(pd + 1e-6);
        const l = Math.hypot(dx, dy);
        if (l > 1e-9) {
          const u = { x: dx / l, y: dy / l };
          if (dir) expect(u.x * dir.x + u.y * dir.y).toBeGreaterThan(0.99);
          dir = u;
        }
        px = f.x;
        py = f.y;
        pd = d;
      }
      expect(f.ai).toBe('attack');
      // Hovering in range: it holds still while it shoots.
      const at = { x: f.x, y: f.y };
      h.run(120);
      expect(Math.hypot(f.x - at.x, f.y - at.y)).toBeLessThan(1e-9);
    });
  }
});
