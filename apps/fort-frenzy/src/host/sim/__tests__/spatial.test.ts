// Spatial hash (SPEC §15.3): circle queries return touching ids, ascending, once each; off-map items
// clamp into the margin cells; matches a brute-force scan.
import { rngStream } from '@pcg/game-kit';
import { describe, expect, it } from 'vitest';
import { createSpatialHash } from '../spatial';

describe('spatial hash', () => {
  it('returns every touching circle once, in ascending id order', () => {
    const h = createSpatialHash(36, 24);
    h.insert(9, 5, 5, 0.4);
    h.insert(3, 5.5, 5, 1.2); // spans many cells
    h.insert(7, 9, 9, 0.3);
    h.insert(1, -2, 5, 0.3); // off the map
    expect(h.query(5, 5, 0.1, [])).toEqual([3, 9]);
    expect(h.query(-2.2, 5, 0.2, [])).toEqual([1]);
    expect(h.query(20, 20, 1, [])).toEqual([]);
    h.clear();
    expect(h.query(5, 5, 3, [])).toEqual([]);
  });

  it('matches a brute-force scan', () => {
    const rng = rngStream(1, 'spatial');
    const h = createSpatialHash(36, 24);
    const items = Array.from({ length: 400 }, (_, i) => ({
      id: i + 1,
      x: rng.next() * 40 - 2,
      y: rng.next() * 28 - 2,
      r: 0.1 + rng.next() * 0.6,
    }));
    for (const it of items) h.insert(it.id, it.x, it.y, it.r);
    const out: number[] = [];
    for (let q = 0; q < 200; q++) {
      const x = rng.next() * 36;
      const y = rng.next() * 24;
      const r = rng.next() * 4;
      const want = items
        .filter((it) => (it.x - x) ** 2 + (it.y - y) ** 2 <= (it.r + r) ** 2)
        .map((it) => it.id);
      expect(h.query(x, y, r, out)).toEqual(want);
    }
  });
});
