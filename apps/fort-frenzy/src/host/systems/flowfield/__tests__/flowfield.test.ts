// Flow fields (SPEC §7, §7.1, §15.5, §15.9 flow field tests).
import { rngStream } from '@pcg/game-kit';
import { describe, expect, it } from 'vitest';
import { buildField, IMPASSABLE, pathFrom, tileIndex, type FlowField } from '../index';

const COLS = 36;
const ROWS = 24;
const grid = { cols: COLS, rows: ROWS };
const at = (c: number, r: number) => tileIndex(c, r, COLS);

type Kind = '.' | 'W' | 'S' | '#';
const OPEN = 1;
const WALL = 50;

/** Ground field costs (§15.5): open 1, snare 1, wall/tower high, blocked impassable. */
const groundCost = (k: Kind) => (k === 'W' ? WALL : k === '#' ? IMPASSABLE : OPEN);
/** Breaker field: walls cheap, so Brutes and the Colossus smash through (§7). */
const breakerCost = (k: Kind) => (k === 'W' ? 2 : k === '#' ? IMPASSABLE : OPEN);

function makeMap(): Kind[] {
  return Array.from({ length: COLS * ROWS }, () => '.' as Kind);
}
const field = (map: Kind[], cost: (k: Kind) => number, goals = rightEdge): FlowField =>
  buildField(grid, (t) => cost(map[t]!), goals);

// The goal: the right edge (stands in for the tiles next to the Citadel).
const rightEdge = Array.from({ length: ROWS }, (_, r) => at(COLS - 1, r));
const start = at(0, 12);

/** A wall line down column 18, with an optional gap. */
function wallLine(map: Kind[], gapRow: number | null) {
  for (let r = 0; r < ROWS; r++) if (r !== gapRow) map[at(18, r)] = 'W';
}

const walls = (map: Kind[], path: number[]) => path.filter((t) => map[t] === 'W').length;

describe('buildField', () => {
  it('routes around walls when a gap exists', () => {
    const map = makeMap();
    wallLine(map, 5);
    const path = pathFrom(field(map, groundCost), start);
    expect(rightEdge).toContain(path[path.length - 1]);
    expect(walls(map, path)).toBe(0);
    expect(path).toContain(at(18, 5));
  });

  it('goes through one wall when the line is sealed', () => {
    const map = makeMap();
    wallLine(map, null);
    const f = field(map, groundCost);
    const path = pathFrom(f, start);
    expect(rightEdge).toContain(path[path.length - 1]);
    expect(walls(map, path)).toBe(1);
    expect(Number.isFinite(f.dist[start]!)).toBe(true);
  });

  it('breaks through when the detour costs more than the wall', () => {
    const map = makeMap();
    wallLine(map, 0); // gap 12 rows away: a 24-tile detour vs one wall at cost 10
    const path = pathFrom(
      field(map, (k) => (k === 'W' ? 10 : groundCost(k))),
      start,
    );
    expect(walls(map, path)).toBe(1);
  });

  it('snares cost the same as open tiles: the field is identical', () => {
    const map = makeMap();
    wallLine(map, 5);
    const without = field(map, groundCost);
    const snared = [...map];
    for (let r = 8; r < 16; r++) for (let c = 4; c < 12; c++) snared[at(c, r)] = 'S';
    const withSnares = field(snared, groundCost);
    expect(withSnares.dist).toEqual(without.dist);
    expect(withSnares.next).toEqual(without.next);
  });

  it('the breaker field prefers walls; the ground field goes round', () => {
    const map = makeMap();
    wallLine(map, 5);
    expect(walls(map, pathFrom(field(map, groundCost), start))).toBe(0);
    const breaker = pathFrom(field(map, breakerCost), start);
    expect(walls(map, breaker)).toBe(1);
    expect(breaker).not.toContain(at(18, 5));
  });

  it('rebuilds on place and destroy', () => {
    const map = makeMap();
    wallLine(map, 5);
    const f = field(map, groundCost);
    const before = { dist: f.dist.slice(), next: f.next.slice() };
    map[at(18, 5)] = 'W'; // a wall placed in the gap
    const placed = buildField(grid, (t) => groundCost(map[t]!), rightEdge, f);
    expect(placed).toBe(f); // rebuilt in place
    expect(walls(map, pathFrom(f, start))).toBe(1);
    map[at(18, 5)] = '.'; // destroyed
    buildField(grid, (t) => groundCost(map[t]!), rightEdge, f);
    expect(f.dist).toEqual(before.dist);
    expect(f.next).toEqual(before.next);
  });

  it('every reachable tile leads strictly downhill to a goal; walled-off tiles are unreachable', () => {
    const rng = rngStream(9, 'flowfield');
    for (let trial = 0; trial < 20; trial++) {
      const map = makeMap();
      for (let i = 0; i < 200; i++) {
        map[rng.int(0, COLS * ROWS - 1)] = rng.next() < 0.5 ? 'W' : '#';
      }
      // A pocket sealed off by impassable terrain.
      for (const [c, r] of [
        [2, 1],
        [1, 2],
        [3, 2],
        [2, 3],
      ] as const)
        map[at(c, r)] = '#';
      map[at(2, 2)] = '.';
      const goals = rightEdge.filter((t) => map[t] !== '#');
      const f = field(map, groundCost, goals);
      expect(f.dist[at(2, 2)]).toBe(Infinity);
      for (let t = 0; t < COLS * ROWS; t++) {
        const d = f.dist[t]!;
        if (!Number.isFinite(d)) {
          expect(f.next[t]).toBe(-1);
          continue;
        }
        if (goals.includes(t)) {
          expect(d).toBe(0);
          expect(f.next[t]).toBe(-1);
          continue;
        }
        const n = f.next[t]!;
        expect(n).toBeGreaterThanOrEqual(0);
        expect(f.dist[n]!).toBeLessThan(d);
        const dc = Math.abs((n % COLS) - (t % COLS));
        const dr = Math.abs(Math.floor(n / COLS) - Math.floor(t / COLS));
        expect(dc + dr).toBe(1);
      }
    }
  });

  it('impassable tiles get no distance', () => {
    const map = makeMap();
    map[at(5, 5)] = '#';
    const f = field(map, groundCost);
    expect(f.dist[at(5, 5)]).toBe(Infinity);
    expect(f.next[at(5, 5)]).toBe(-1);
  });

  it('rebuilds a 36 × 24 field in under 1 ms (mean of 100)', () => {
    const rng = rngStream(3, 'bench');
    const map = makeMap();
    for (let i = 0; i < 150; i++) map[rng.int(0, COLS * ROWS - 1)] = 'W';
    const cost = (t: number) => groundCost(map[t]!);
    const f = buildField(grid, cost, rightEdge);
    for (let i = 0; i < 50; i++) buildField(grid, cost, rightEdge, f); // warm up
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) buildField(grid, cost, rightEdge, f);
    const meanMs = Number(process.hrtime.bigint() - t0) / 1e6 / 100;
    expect(meanMs).toBeLessThan(1);
  });
});
