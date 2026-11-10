// Flow fields (SPEC §7, §7.1, §15.5, §15.9 flow field tests).
import { rngStream } from '@pcg/game-kit';
import { describe, expect, it } from 'vitest';
import {
  buildField,
  IMPASSABLE,
  pathFrom,
  STEER_LOOKAHEAD,
  steerTile,
  tileIndex,
  type FlowField,
} from '../index';

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

// FF10-fix-1 (C3: enemies head for the Citadel on a direct diagonal, not straight up then along the
// back): 8-neighbor fields that never cut a solid corner, and any-angle steering down the chain.
describe('diagonal fields and steering', () => {
  const solidOf = (map: Kind[]) => (t: number) => map[t] === 'W' || map[t] === '#';
  const dfield = (map: Kind[], cost: (k: Kind) => number, goals = rightEdge): FlowField =>
    buildField(grid, (t) => cost(map[t]!), goals, undefined, {
      diagonal: true,
      solid: solidOf(map),
    });

  it('the FF2 wall rules hold with diagonals', () => {
    const gap = makeMap();
    wallLine(gap, 5);
    const round = pathFrom(dfield(gap, groundCost), start);
    expect(walls(gap, round)).toBe(0);
    expect(round).toContain(at(18, 5));
    const sealed = makeMap();
    wallLine(sealed, null);
    expect(walls(sealed, pathFrom(dfield(sealed, groundCost), start))).toBe(1);
    expect(walls(gap, pathFrom(dfield(gap, breakerCost), start))).toBe(1);
    const snared = [...gap];
    for (let r = 8; r < 16; r++) for (let c = 4; c < 12; c++) snared[at(c, r)] = 'S';
    expect(dfield(snared, groundCost).next).toEqual(dfield(gap, groundCost).next);
  });

  it('every reachable tile steps strictly downhill to a neighbor, never past a solid corner', () => {
    const rng = rngStream(9, 'flowfield-diag');
    for (let trial = 0; trial < 20; trial++) {
      const map = makeMap();
      for (let i = 0; i < 200; i++) map[rng.int(0, COLS * ROWS - 1)] = rng.next() < 0.5 ? 'W' : '#';
      const goals = rightEdge.filter((t) => map[t] !== '#');
      const f = dfield(map, groundCost, goals);
      let diagonals = 0;
      for (let t = 0; t < COLS * ROWS; t++) {
        const d = f.dist[t]!;
        if (!Number.isFinite(d) || goals.includes(t)) continue;
        const n = f.next[t]!;
        expect(f.dist[n]!).toBeLessThan(d);
        const dc = (n % COLS) - (t % COLS);
        const dr = Math.floor(n / COLS) - Math.floor(t / COLS);
        expect(Math.max(Math.abs(dc), Math.abs(dr))).toBe(1);
        if (dc !== 0 && dr !== 0) {
          diagonals++;
          expect(['W', '#']).not.toContain(map[t + dc]);
          expect(['W', '#']).not.toContain(map[t + dr * COLS]);
        }
      }
      expect(diagonals).toBeGreaterThan(0);
    }
  });

  it('steers straight across open ground: the walked line stays near the straight one', () => {
    const map = makeMap();
    const goal = [at(30, 1)];
    const f = dfield(map, groundCost, goal);
    for (const [c0, r0] of [
      [0, 23],
      [2, 12],
      [10, 22],
    ] as const) {
      // A point walker heading for the steer tile from where it stands, 0.1 tiles per step.
      let x = c0 + 0.5;
      let y = r0 + 0.5;
      let length = 0;
      let maxDev = 0;
      const gx = 30.5;
      const gy = 1.5;
      const L = Math.hypot(gx - x, gy - y);
      const [ux, uy] = [(gx - x) / L, (gy - y) / L];
      const [sx, sy] = [x, y];
      for (let i = 0; i < 2000; i++) {
        const t = at(Math.floor(x), Math.floor(y));
        const s = steerTile(f, t);
        if (s < 0) break;
        const tx = (s % COLS) + 0.5 - x;
        const ty = Math.floor(s / COLS) + 0.5 - y;
        const l = Math.hypot(tx, ty) || 1;
        const step = Math.min(0.1, l);
        x += (tx / l) * step;
        y += (ty / l) * step;
        length += step;
        maxDev = Math.max(maxDev, Math.abs((x - sx) * uy - (y - sy) * ux));
      }
      expect(at(Math.floor(x), Math.floor(y))).toBe(goal[0]);
      expect(length).toBeLessThanOrEqual(L * 1.05);
      expect(maxDev).toBeLessThan(0.75);
    }
  });

  it('never shortcuts through a wall or a pricier tile the chain avoids', () => {
    const map = makeMap();
    wallLine(map, 5);
    const f = dfield(map, groundCost);
    // The straight line from any tile left of the wall to its steer tile crosses no wall.
    const crosses = (a: number, b: number, bad: (t: number) => boolean) => {
      const [ax, ay] = [(a % COLS) + 0.5, Math.floor(a / COLS) + 0.5];
      const [bx, by] = [(b % COLS) + 0.5, Math.floor(b / COLS) + 0.5];
      for (let u = 0; u <= 1; u += 0.01) {
        if (bad(at(Math.floor(ax + (bx - ax) * u), Math.floor(ay + (by - ay) * u)))) return true;
      }
      return false;
    };
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < 18; c++) {
        const s = steerTile(f, at(c, r));
        expect(crosses(at(c, r), s, (t) => map[t] === 'W')).toBe(false);
      }
    }
    // A pricey block (cost 5) the field goes round: steering from outside never cuts into it.
    const pricey = (t: number) => t % COLS >= 12 && t % COLS <= 20 && Math.floor(t / COLS) >= 6;
    const g = buildField(grid, (t) => (pricey(t) ? 5 : 1), rightEdge, undefined, {
      diagonal: true,
    });
    for (let r = 0; r < ROWS; r++) {
      const s = steerTile(g, at(4, r));
      expect(crosses(at(4, r), s, pricey)).toBe(false);
    }
  });

  it('steer tiles are cached and reset on rebuild; unbuilt fields fall back to next', () => {
    const map = makeMap();
    const f = dfield(map, groundCost);
    const s = steerTile(f, start);
    expect(steerTile(f, start)).toBe(s);
    expect(s).toBe(at(STEER_LOOKAHEAD, 12)); // straight along the row, as far as it looks
    wallLine(map, 5);
    buildField(grid, (t) => groundCost(map[t]!), rightEdge, f, {
      diagonal: true,
      solid: solidOf(map),
    });
    expect(steerTile(f, start)).not.toBe(s);
    const bare: FlowField = {
      cols: 2,
      rows: 1,
      dist: new Float32Array([1, 0]),
      next: new Int16Array([1, -1]),
    };
    expect(steerTile(bare, 0)).toBe(1);
    expect(steerTile(bare, 1)).toBe(-1);
  });

  it('rebuilds a diagonal 36 × 24 field in under 1 ms (mean of 100)', () => {
    const rng = rngStream(3, 'bench');
    const map = makeMap();
    for (let i = 0; i < 150; i++) map[rng.int(0, COLS * ROWS - 1)] = 'W';
    const cost = (t: number) => groundCost(map[t]!);
    const opts = { diagonal: true, solid: solidOf(map) };
    const f = buildField(grid, cost, rightEdge, undefined, opts);
    for (let i = 0; i < 50; i++) buildField(grid, cost, rightEdge, f, opts);
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) buildField(grid, cost, rightEdge, f, opts);
    const meanMs = Number(process.hrtime.bigint() - t0) / 1e6 / 100;
    expect(meanMs).toBeLessThan(1);
  });
});
