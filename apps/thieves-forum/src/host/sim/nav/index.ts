// Navigation and line of sight from the layout (SPEC §6.3, §12.3): a small waypoint graph (lane
// points, alley and passage mouths, entries, stall customer spots) plus straight-line shortcuts when
// the way is clear. Steering (npc/) walks the path; this module only says which points to aim for.
// Line of sight is a segment test against the blocker rectangles (stalls, the stocks, the closed gate);
// guards (TF9) build their view cones on it. Everything is derived from `LayoutDef`, never constants
// (BUILD_PLAN §3 "Layout is config"), and cached per layout.
import type { LayoutDef, Rect, StallId, Vec2 } from '../../../content/types';
import { dist, inflate, segmentHitsRect } from '../geometry';

export interface NavGraph {
  layout: LayoutDef;
  nodes: Vec2[];
  /** Adjacency: neighbour index and edge length. */
  edges: { to: number; d: number }[][];
  /** Blockers grown by the walking clearance. */
  padded: Rect[];
  /** Where a body's centre may be (walkable bounding box shrunk by the body radius). */
  bounds: { x0: number; y0: number; x1: number; y1: number };
}

/** Clearance a path keeps from blockers (body radius plus a margin), tiles. */
export const NAV_PAD = 0.5;
/** Lane points are spaced at most this far apart, tiles. */
const LANE_STEP = 4;
/** Graph edges are at most this long (keeps the graph small), tiles. */
const MAX_EDGE = 14;

const cache = new WeakMap<LayoutDef, NavGraph>();
const boxes = new WeakMap<LayoutDef, { x0: number; y0: number; x1: number; y1: number }>();

/** The walkable bounding box of the layout (its lanes, alleys and passages). */
export function walkBox(layout: LayoutDef): { x0: number; y0: number; x1: number; y1: number } {
  const hit = boxes.get(layout);
  if (hit) return hit;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const poly of layout.walkable)
    for (const p of poly) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  const box = { x0, y0, x1, y1 };
  boxes.set(layout, box);
  return box;
}

/** Line of sight between two ground points: no blocker rectangle in the way (SPEC §6.3, §6.12). */
export function lineOfSight(layout: LayoutDef, a: Vec2, b: Vec2, gateOpen = false): boolean {
  for (const r of layout.blockers) {
    if (gateOpen && r === layout.gate.rect) continue;
    if (segmentHitsRect(a.x, a.y, b.x, b.y, r)) return false;
  }
  return true;
}

/** Can a body walk straight from a to b (blockers grown by the clearance, inside the walkable box)? */
export function clearPath(g: NavGraph, a: Vec2, b: Vec2): boolean {
  const { y0, y1 } = g.bounds;
  if (a.y < y0 - 1e-6 || a.y > y1 + 1e-6 || b.y < y0 - 1e-6 || b.y > y1 + 1e-6) return false;
  for (const r of g.padded) if (segmentHitsRect(a.x, a.y, b.x, b.y, r)) return false;
  return true;
}

/** Customer spot `i` of `n` along a stall's counter (SPEC §6.6 browse points). */
export function customerSpot(layout: LayoutDef, stall: StallId, i: number, n: number): Vec2 {
  const c = layout.stalls[stall]!.customer;
  return { x: c.x0 + ((i + 0.5) * (c.x1 - c.x0)) / n, y: c.y };
}

/** Queue place `k` (0 = first) behind a stall's customer line, in the lane (technique 5). */
export function queueSpot(layout: LayoutDef, stall: StallId, k: number, gap: number): Vec2 {
  const s = layout.stalls[stall]!;
  const cx = (s.customer.x0 + s.customer.x1) / 2;
  return { x: cx + (k % 2 === 0 ? -0.6 : 0.6), y: s.customer.y + gap * (k + 1) };
}

/** The point a customer faces while browsing: the middle of the counter front. */
export function counterPoint(layout: LayoutDef, stall: StallId): Vec2 {
  const s = layout.stalls[stall]!;
  return { x: s.footprint.x + s.footprint.w / 2, y: s.counterY };
}

export function navGraph(layout: LayoutDef, radius: number): NavGraph {
  const hit = cache.get(layout);
  if (hit) return hit;
  const box = walkBox(layout);
  const pad = Math.max(NAV_PAD, radius + 0.1);
  const bounds = { x0: box.x0 + radius, y0: box.y0 + radius, x1: box.x1 - radius, y1: box.y1 - radius };
  const padded = layout.blockers.map((r) => inflate(r, pad - 0.05));
  const nodes: Vec2[] = [];
  // Lane centre points, plus points near the lane edges by every stall row.
  for (const lane of Object.values(layout.lanes)) {
    const n = Math.ceil((box.x1 - box.x0 - 2) / LANE_STEP);
    for (let i = 0; i <= n; i++) {
      const x = box.x0 + 1 + ((box.x1 - box.x0 - 2) * i) / n;
      nodes.push({ x, y: lane.y });
    }
  }
  // Alley and passage mouths on both sides, and their middles.
  for (const r of [...layout.alleys.map((a) => a.rect), ...layout.passages.map((p) => p.rect)]) {
    const cx = r.x + r.w / 2;
    nodes.push({ x: cx, y: r.y - pad - 0.3 });
    nodes.push({ x: cx, y: r.y + r.h / 2 });
    nodes.push({ x: cx, y: r.y + r.h + pad + 0.3 });
  }
  for (const e of layout.entries) nodes.push({ x: e.at.x, y: e.at.y });
  for (const s of layout.stalls)
    nodes.push({ x: (s.customer.x0 + s.customer.x1) / 2, y: s.customer.y + 0.6 });
  const g: NavGraph = { layout, nodes, edges: nodes.map(() => []), padded, bounds };
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d > MAX_EDGE || !clearPath(g, a, b)) continue;
      g.edges[i]!.push({ to: j, d });
      g.edges[j]!.push({ to: i, d });
    }
  cache.set(layout, g);
  return g;
}

/**
 * Waypoints from `from` to `to` (the goal last; `from` excluded). A clear straight line is one
 * waypoint; otherwise Dijkstra over the graph from every node `from` can see to every node that can
 * see `to`. Returns [to] when no route exists (collision keeps the body out of blockers).
 */
export function findPath(g: NavGraph, from: Vec2, to: Vec2): Vec2[] {
  if (clearPath(g, from, to)) return [{ x: to.x, y: to.y }];
  const n = g.nodes.length;
  const best = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const goalCost = new Float64Array(n).fill(Infinity);
  for (let i = 0; i < n; i++) {
    const p = g.nodes[i]!;
    if (clearPath(g, from, p)) best[i] = dist(from.x, from.y, p.x, p.y);
    if (clearPath(g, p, to)) goalCost[i] = dist(p.x, p.y, to.x, to.y);
  }
  let bestEnd = -1;
  let bestTotal = Infinity;
  for (;;) {
    let u = -1;
    let ud = Infinity;
    for (let i = 0; i < n; i++)
      if (!done[i] && best[i]! < ud) {
        ud = best[i]!;
        u = i;
      }
    if (u < 0 || ud >= bestTotal) break;
    done[u] = 1;
    if (ud + goalCost[u]! < bestTotal) {
      bestTotal = ud + goalCost[u]!;
      bestEnd = u;
    }
    for (const e of g.edges[u]!) {
      const nd = ud + e.d;
      if (nd < best[e.to]!) {
        best[e.to] = nd;
        prev[e.to] = u;
      }
    }
  }
  if (bestEnd < 0) return [{ x: to.x, y: to.y }];
  const path: Vec2[] = [{ x: to.x, y: to.y }];
  for (let i = bestEnd; i >= 0; i = prev[i]!) path.push({ ...g.nodes[i]! });
  return path.reverse();
}
