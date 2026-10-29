// Wall and shock-net autotiles (SPEC §2.5, §15.2; art README "Walls and shock nets"): the 4-bit mask
// of same-type neighbors (N 1, E 2, S 4, W 8), recomputed for a tile and its neighbors on every
// place or remove, and the shared-post rule the wall frames are drawn with.

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export type Edge = 'n' | 'e' | 's' | 'w';

/** All 16 masks, for galleries and tests. */
export const ALL_MASKS = Array.from({ length: 16 }, (_, i) => i);

/** The mask of tile (c, r) given a same-type lookup. N is up-screen (r − 1), E is right (c + 1). */
export function maskAt(has: (c: number, r: number) => boolean, c: number, r: number): number {
  return (
    (has(c, r - 1) ? N : 0) | (has(c + 1, r) ? E : 0) | (has(c, r + 1) ? S : 0) | (has(c - 1, r) ? W : 0)
  );
}

/** Masks for a set of tiles keyed `c,r` (what a place/remove recomputes). */
export function masksFor(tiles: Iterable<readonly [number, number]>): Map<string, number> {
  const set = new Set<string>();
  for (const [c, r] of tiles) set.add(`${c},${r}`);
  const has = (c: number, r: number) => set.has(`${c},${r}`);
  const out = new Map<string, number>();
  for (const key of set) {
    const [c, r] = key.split(',').map(Number) as [number, number];
    out.set(key, maskAt(has, c, r));
  }
  return out;
}

/** Tiles whose mask changes when (c, r) is placed or removed: itself and its four neighbors. */
export function affectedBy(c: number, r: number): [number, number][] {
  return [
    [c, r],
    [c, r - 1],
    [c + 1, r],
    [c, r + 1],
    [c - 1, r],
  ];
}

/** Straight walls: no neighbors or E/W only run across; N/S only run into the screen. */
export function wallShape(mask: number): 'across' | 'into' | 'joint' {
  if (mask === 0 || mask === E || mask === W || mask === (E | W)) return 'across';
  if (mask === N || mask === S || mask === (N | S)) return 'into';
  return 'joint'; // corners, T-junctions and the cross: a half panel per neighbor + a center post
}

/** Tile edges the wall reaches (a post sits at the middle of each). */
export function reachedEdges(mask: number): Edge[] {
  const shape = wallShape(mask);
  if (shape === 'across') return ['e', 'w'];
  if (shape === 'into') return ['n', 's'];
  return (['n', 'e', 's', 'w'] as const).filter((_, i) => mask & (1 << i));
}

/**
 * Shared posts: a tile draws its N and W edge posts itself, and its E and S edge posts only when
 * there's no neighbor on that side, so each shared post is drawn exactly once. The art bakes this
 * into `wall/m<n>`; code uses it for post-tip effects (charged sparks, the wall strike origin).
 */
export function postsDrawn(mask: number): { edges: Edge[]; center: boolean } {
  const edges = reachedEdges(mask).filter(
    (e) => e === 'n' || e === 'w' || (e === 'e' && !(mask & E)) || (e === 's' && !(mask & S)),
  );
  return { edges, center: wallShape(mask) === 'joint' };
}
