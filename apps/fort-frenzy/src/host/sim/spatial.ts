// Uniform-grid spatial hash for "who's near me" queries (SPEC §15.3, decision #4). Rebuilt each step
// from positions, so it's never part of the state hash. Allocation-free after warm-up: typed arrays that
// grow, per-cell linked lists, and a query stamp to report an item spanning several cells once.
import type { EntityId, SpatialHash } from './types';

const ascending = (a: number, b: number) => a - b;

export function createSpatialHash(
  cols: number,
  rows: number,
  cellSize = 1,
  margin = 3,
): SpatialHash {
  const gw = Math.ceil(cols / cellSize) + 2 * margin;
  const gh = Math.ceil(rows / cellSize) + 2 * margin;
  const head = new Int32Array(gw * gh).fill(-1);
  let cap = 256;
  // Items.
  let ids = new Int32Array(cap);
  let xs = new Float64Array(cap);
  let ys = new Float64Array(cap);
  let rs = new Float64Array(cap);
  let stamp = new Uint32Array(cap);
  let items = 0;
  // Cell entries (an item is in every cell its circle's box touches).
  let ecap = 1024;
  let entItem = new Int32Array(ecap);
  let entNext = new Int32Array(ecap);
  let entries = 0;
  let query = 0;

  const cellX = (x: number) => Math.min(gw - 1, Math.max(0, Math.floor(x / cellSize) + margin));
  const cellY = (y: number) => Math.min(gh - 1, Math.max(0, Math.floor(y / cellSize) + margin));

  function growItems() {
    cap *= 2;
    const grow = <A extends Int32Array | Float64Array | Uint32Array>(
      a: A,
      make: (n: number) => A,
    ) => {
      const b = make(cap);
      b.set(a);
      return b;
    };
    ids = grow(ids, (n) => new Int32Array(n));
    xs = grow(xs, (n) => new Float64Array(n));
    ys = grow(ys, (n) => new Float64Array(n));
    rs = grow(rs, (n) => new Float64Array(n));
    stamp = grow(stamp, (n) => new Uint32Array(n));
  }

  function growEntries() {
    ecap *= 2;
    const a = new Int32Array(ecap);
    a.set(entItem);
    entItem = a;
    const b = new Int32Array(ecap);
    b.set(entNext);
    entNext = b;
  }

  return {
    cellSize,
    clear() {
      head.fill(-1);
      items = 0;
      entries = 0;
    },
    insert(id: EntityId, x: number, y: number, r: number) {
      if (items === cap) growItems();
      const i = items++;
      ids[i] = id;
      xs[i] = x;
      ys[i] = y;
      rs[i] = r;
      stamp[i] = 0;
      const x0 = cellX(x - r);
      const x1 = cellX(x + r);
      const y0 = cellY(y - r);
      const y1 = cellY(y + r);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          if (entries === ecap) growEntries();
          const c = cy * gw + cx;
          const e = entries++;
          entItem[e] = i;
          entNext[e] = head[c]!;
          head[c] = e;
        }
      }
    },
    query(x: number, y: number, r: number, out: EntityId[]) {
      out.length = 0;
      query = (query + 1) >>> 0 || 1;
      const x0 = cellX(x - r);
      const x1 = cellX(x + r);
      const y0 = cellY(y - r);
      const y1 = cellY(y + r);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          for (let e = head[cy * gw + cx]!; e !== -1; e = entNext[e]!) {
            const i = entItem[e]!;
            if (stamp[i] === query) continue;
            stamp[i] = query;
            const dx = xs[i]! - x;
            const dy = ys[i]! - y;
            const rr = rs[i]! + r;
            if (dx * dx + dy * dy <= rr * rr) out.push(ids[i]!);
          }
        }
      }
      // Results are short: insertion sort beats Array#sort's call overhead.
      const n = out.length;
      if (n > 24) out.sort(ascending);
      else {
        for (let i = 1; i < n; i++) {
          const v = out[i]!;
          let j = i - 1;
          while (j >= 0 && out[j]! > v) {
            out[j + 1] = out[j]!;
            j--;
          }
          out[j + 1] = v;
        }
      }
      return out;
    },
  };
}
