// Generic flow fields: Dijkstra outward from goal tiles over a weighted grid (SPEC §7, §15.5).
// Extraction-ready (§15.1): the grid is just its size and costs come from a callback, so the sim's
// `TileGrid` and `FlowField` fit as they are. 4-neighbor steps (N, E, S, W) by default, or 8 with
// `diagonal` (FF10-fix-1: octile steps that never cut a solid tile's corner); entering a tile costs
// `cost(tile)` (× √2 diagonally), which must be > 0 (Infinity = impassable), so every reachable
// tile's `next` is strictly downhill. `steerTile` turns the tile-by-tile chain into an any-angle
// heading (C3: enemies head for the Citadel on a direct diagonal, not straight up and then along
// the back). Allocation-free when rebuilt `into` an existing field.
// Frozen at FF2 (BUILD_PLAN §3): additive changes only.

/** `next` is the tile index to step to; −1 = a goal, or unreachable (`dist` = Infinity). */
export interface FlowField {
  cols: number;
  rows: number;
  dist: Float32Array;
  next: Int16Array;
}

export const IMPASSABLE = Infinity;

/** Additive build options (FF10-fix-1). */
export interface FieldOptions {
  /** 8-neighbor steps; a diagonal costs √2 × the entered tile's cost. Default false (N, E, S, W). */
  diagonal?: boolean;
  /**
   * Tiles whose corner a diagonal step may not cut (either side tile solid = no diagonal). Default:
   * impassable, or costlier than both tiles of the step.
   */
  solid?: (tile: number) => boolean;
}

/** How far down the chain `steerTile` looks, tiles. */
export const STEER_LOOKAHEAD = 32;
/** Half-width of the clear corridor `steerTile` needs, tiles (about an enemy's body). */
export const STEER_HALF_WIDTH = 0.3;
/** Not computed yet (steer cache). */
const UNSET = -2;

/** Kept beside the frozen shape: the tile costs of the last build and the lazy steer cache. */
interface FieldMeta {
  cost: Float32Array;
  far: Int16Array;
}
const metas = new WeakMap<FlowField, FieldMeta>();

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
  opts?: FieldOptions,
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
  let meta = metas.get(f);
  if (!meta || meta.cost.length !== n) {
    meta = { cost: new Float32Array(n), far: new Int16Array(n) };
    metas.set(f, meta);
  }
  const costs = meta.cost;
  for (let t = 0; t < n; t++) costs[t] = cost(t);
  meta.far.fill(UNSET);
  const diagonal = opts?.diagonal === true;
  const solid = opts?.solid;

  ensureHeap((diagonal ? 8 : 4) * n + goals.length + 1);
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
    if (g < 0 || g >= n || dist[g] === 0 || !(costs[g]! < Infinity)) continue;
    dist[g] = 0;
    push(g, 0);
  }

  while (size > 0) {
    const k = keys[0]!;
    const t = pop();
    if (k > dist[t]!) continue; // stale entry
    // Stepping from a neighbor onto `t` costs `cost(t)` (× √2 diagonally).
    const ct = costs[t]!;
    const nd = dist[t]! + ct;
    const c = t % cols;
    const up = t >= cols;
    const down = t + cols < n;
    const left = c > 0;
    const right = c < cols - 1;
    // N, E, S, W.
    if (up) relax(t - cols, t, nd);
    if (right) relax(t + 1, t, nd);
    if (down) relax(t + cols, t, nd);
    if (left) relax(t - 1, t, nd);
    if (!diagonal) continue;
    // NE, SE, SW, NW: both side tiles of the step must be open (no corner cutting).
    const dd = dist[t]! + ct * Math.SQRT2;
    if (up && right) diag(t - cols + 1, t, t - cols, t + 1, dd);
    if (down && right) diag(t + cols + 1, t, t + cols, t + 1, dd);
    if (down && left) diag(t + cols - 1, t, t + cols, t - 1, dd);
    if (up && left) diag(t - cols - 1, t, t - cols, t - 1, dd);
  }
  return f;

  function relax(nb: number, via: number, nd: number) {
    if (nd >= dist[nb]! || !(costs[nb]! < Infinity)) return;
    dist[nb] = nd;
    next[nb] = via;
    push(nb, dist[nb]!);
  }

  function diag(nb: number, via: number, s1: number, s2: number, nd: number) {
    if (nd >= dist[nb]! || !(costs[nb]! < Infinity)) return;
    if (blocks(s1, nb, via) || blocks(s2, nb, via)) return;
    relax(nb, via, nd);
  }

  function blocks(side: number, a: number, b: number): boolean {
    if (solid) return solid(side);
    const cs = costs[side]!;
    return !(cs < Infinity) || cs > Math.max(costs[a]!, costs[b]!);
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

/**
 * The tile to head for from `from` (FF10-fix-1): the farthest tile down the field's chain (up to
 * `STEER_LOOKAHEAD`) that a body-wide corridor from `from`'s center reaches without crossing a tile
 * costlier than the chain's next step. A walker beelines across open ground but never shortcuts
 * through a wall, a tower or (for a Hunter) the pricier tiles its field steers around, and the
 * look-ahead stops where the chain climbs in cost (a blocker to attack). `next[from]` when nothing
 * farther is clear; −1 at a goal or unreachable. Cached per tile until the field rebuilds.
 */
export function steerTile(field: FlowField, from: number): number {
  const n0 = field.next[from]!;
  if (n0 < 0) return -1;
  const meta = metas.get(field);
  if (!meta) return n0;
  const cached = meta.far[from]!;
  if (cached !== UNSET) return cached;
  const cost = meta.cost;
  const cap = cost[n0]!;
  // The chain while it stays no costlier than its first step.
  const chain = chainScratch;
  let len = 0;
  chain[len++] = n0;
  let t = n0;
  while (len < STEER_LOOKAHEAD) {
    const nx = field.next[t]!;
    if (nx < 0 || cost[nx]! > cap) break;
    chain[len++] = nx;
    t = nx;
  }
  let far = n0;
  for (let i = len - 1; i > 0; i--) {
    if (clear(field.cols, field.rows, cost, from, chain[i]!, cap)) {
      far = chain[i]!;
      break;
    }
  }
  meta.far[from] = far;
  return far;
}

const chainScratch = new Int32Array(STEER_LOOKAHEAD);
/** Sample spacing along a corridor, tiles. */
const SAMPLE = 0.25;

/** A body-wide corridor between two tile centers crosses only tiles costing ≤ `cap`. */
function clear(
  cols: number,
  rows: number,
  cost: Float32Array,
  a: number,
  b: number,
  cap: number,
): boolean {
  const ac = a % cols;
  const bc = b % cols;
  const ax = ac + 0.5;
  const ay = (a - ac) / cols + 0.5;
  const dx = bc + 0.5 - ax;
  const dy = (b - bc) / cols + 0.5 - ay;
  const l = Math.sqrt(dx * dx + dy * dy);
  if (l < 1e-9) return true;
  const px = (-dy / l) * STEER_HALF_WIDTH;
  const py = (dx / l) * STEER_HALF_WIDTH;
  const steps = Math.ceil(l / SAMPLE);
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const x = ax + dx * u;
    const y = ay + dy * u;
    for (let side = -1; side <= 1; side++) {
      const c = Math.floor(x + px * side);
      const r = Math.floor(y + py * side);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return false;
      if (!(cost[r * cols + c]! <= cap)) return false;
    }
  }
  return true;
}
