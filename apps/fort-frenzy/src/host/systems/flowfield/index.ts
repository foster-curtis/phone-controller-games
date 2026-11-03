// Generic flow fields: Dijkstra outward from goal tiles over a weighted grid (SPEC §7, §15.5).
// Extraction-ready (§15.1): the grid is just its size and costs come from a callback, so the sim's
// `TileGrid` and `FlowField` fit as they are. 4-neighbor steps (N, E, S, W); entering a tile costs
// `cost(tile)`, which must be > 0 (Infinity = impassable), so every reachable tile's `next` is strictly
// downhill. Allocation-free when rebuilt `into` an existing field.
// Frozen at FF2 (BUILD_PLAN §3): additive changes only.

/** `next` is the tile index to step to; −1 = a goal, or unreachable (`dist` = Infinity). */
export interface FlowField {
  cols: number;
  rows: number;
  dist: Float32Array;
  next: Int16Array;
}

export const IMPASSABLE = Infinity;

/** Row-major tile index. */
export function tileIndex(col: number, row: number, cols: number): number {
  return row * cols + col;
}

// Reused binary-heap scratch (lazy deletion, so a tile can be queued once per neighbor).
let heapTiles = new Int32Array(0);
let heapKeys = new Float64Array(0);

function ensureHeap(capacity: number) {
  if (heapTiles.length < capacity) {
    heapTiles = new Int32Array(capacity);
    heapKeys = new Float64Array(capacity);
  }
}

/**
 * Builds (or rebuilds `into`, same size) the field toward `goals`. Ties resolve by the heap's
 * deterministic order, so the same inputs always give the same field.
 */
export function buildField(
  grid: { cols: number; rows: number },
  cost: (tile: number) => number,
  goals: readonly number[],
  into?: FlowField,
): FlowField {
  const { cols, rows } = grid;
  const n = cols * rows;
  if (n > 0x7fff) throw new Error('buildField: grid too large for Int16 next');
  const f: FlowField =
    into && into.cols === cols && into.rows === rows
      ? into
      : { cols, rows, dist: new Float32Array(n), next: new Int16Array(n) };
  const { dist, next } = f;
  dist.fill(Infinity);
  next.fill(-1);

  ensureHeap(4 * n + goals.length + 1);
  const tiles = heapTiles;
  const keys = heapKeys;
  let size = 0;

  const push = (t: number, k: number) => {
    let i = size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! < k || (keys[p] === k && tiles[p]! < t)) break;
      tiles[i] = tiles[p]!;
      keys[i] = keys[p]!;
      i = p;
    }
    tiles[i] = t;
    keys[i] = k;
  };
  const pop = (): number => {
    const top = tiles[0]!;
    const t = tiles[--size]!;
    const k = keys[size]!;
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= size) break;
      const r = c + 1;
      if (r < size && (keys[r]! < keys[c]! || (keys[r] === keys[c] && tiles[r]! < tiles[c]!)))
        c = r;
      if (keys[c]! > k || (keys[c] === k && tiles[c]! > t)) break;
      tiles[i] = tiles[c]!;
      keys[i] = keys[c]!;
      i = c;
    }
    tiles[i] = t;
    keys[i] = k;
    return top;
  };

  for (const g of goals) {
    if (g < 0 || g >= n || dist[g] === 0 || !(cost(g) < Infinity)) continue;
    dist[g] = 0;
    push(g, 0);
  }

  while (size > 0) {
    const k = keys[0]!;
    const t = pop();
    if (k > dist[t]!) continue; // stale entry
    // Stepping from a neighbor onto `t` costs `cost(t)`.
    const nd = dist[t]! + cost(t);
    const c = t % cols;
    // N, E, S, W.
    if (t >= cols) relax(t - cols, t, nd);
    if (c < cols - 1) relax(t + 1, t, nd);
    if (t + cols < n) relax(t + cols, t, nd);
    if (c > 0) relax(t - 1, t, nd);
  }
  return f;

  function relax(nb: number, via: number, nd: number) {
    if (nd >= dist[nb]! || !(cost(nb) < Infinity)) return;
    dist[nb] = nd;
    next[nb] = via;
    push(nb, dist[nb]!);
  }
}

/** Tiles from `start` following `next` to a goal (inclusive); empty if `start` is unreachable. */
export function pathFrom(
  field: FlowField,
  start: number,
  maxSteps = field.cols * field.rows,
): number[] {
  if (!Number.isFinite(field.dist[start]!)) return [];
  const path = [start];
  let t = start;
  while (field.next[t]! >= 0 && path.length <= maxSteps) {
    t = field.next[t]!;
    path.push(t);
  }
  return path;
}
