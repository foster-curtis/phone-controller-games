// Map ground (SPEC §3.1, §15.2 Map v1): stone tiles (variant 1 on most, 2–4 sparsely by a seeded
// hash of the tile, so the ground is stable run to run), border edges except on lane tiles, the lane
// entries open or sealed, and sparse flat decor. All on layer 1.
import type { LaneId } from '../../shared/ids';
import type { ThemeHost } from '../../themes/types';
import type { ArtImage } from './atlas';
import { placeFrame, type RenderContext } from './context';
import type { LaneState } from './types';

export const MAP_COLS = 36;
export const MAP_ROWS = 24;

/** Lane entry tiles (map v1) and the lane frame anchors in world tiles. */
export const LANES: Record<LaneId, { tiles: [number, number][]; anchor: [number, number] }> = {
  bottom: { tiles: [[17, 23], [18, 23]], anchor: [18, 24] },
  left: { tiles: [[0, 11], [0, 12]], anchor: [0.5, 12] },
  right: { tiles: [[35, 11], [35, 12]], anchor: [35.5, 12] },
};

/** A stable 32-bit hash of a tile and a salt (render variety without randomness). */
export function tileHash(c: number, r: number, salt = 0): number {
  let h = (Math.imul(c + 1, 0x9e3779b1) ^ Math.imul(r + 1, 0x85ebca77) ^ Math.imul(salt + 1, 0xc2b2ae3d)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Ground variant 1–4: 1 on most tiles, 2–4 on about 15%. */
export function groundVariant(c: number, r: number): number {
  const h = tileHash(c, r);
  return h % 100 < 85 ? 1 : 2 + (h % 3);
}

export function edgeFor(c: number, r: number, cols = MAP_COLS, rows = MAP_ROWS): string | null {
  const n = r === 0;
  const s = r === rows - 1;
  const w = c === 0;
  const e = c === cols - 1;
  if (n && w) return 'nw';
  if (n && e) return 'ne';
  if (s && w) return 'sw';
  if (s && e) return 'se';
  if (n) return 'n';
  if (s) return 's';
  if (w) return 'w';
  if (e) return 'e';
  return null;
}

const isLaneTile = (c: number, r: number) =>
  Object.values(LANES).some((l) => l.tiles.some(([lc, lr]) => lc === c && lr === r));

export class MapView {
  private lanes = new Map<LaneId, ArtImage>();
  private images: ArtImage[] = [];

  constructor(
    private readonly ctx: RenderContext,
    private readonly map: ThemeHost['map'],
    /** Draw only this tile window (the gallery's map sample); default the whole map. */
    readonly window: { c0: number; r0: number; c1: number; r1: number } = { c0: 0, r0: 0, c1: MAP_COLS - 1, r1: MAP_ROWS - 1 },
  ) {
    const { c0, r0, c1, r1 } = window;
    // Layer-1 order: tiles (row by row), decor, edges, lanes; the Citadel plate sorts after them.
    const at = (name: string, c: number, r: number, base: number) => {
      const { sx, sy } = ctx.camera.worldToScreen(c + 0.5, r + 0.5);
      this.images.push(placeFrame(ctx, name, 'ground', sx, sy, { sortY: base + r * 0.01 }));
    };
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++)
        at(this.map.ground[groundVariant(c, r) - 1] ?? this.map.ground[0]!, c, r, 0);
    }
    const decor = this.map.decor ?? [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const h = tileHash(c, r, 7);
        if (decor.length > 0 && h % 100 < 3 && !edgeFor(c, r)) at(decor[h % decor.length]!, c, r, 1);
      }
    }
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const e = edgeFor(c, r);
        if (e && !isLaneTile(c, r)) at(this.map.edges[e as keyof ThemeHost['map']['edges']], c, r, 2);
      }
    }
    for (const lane of Object.keys(LANES) as LaneId[]) {
      const [x, y] = LANES[lane].anchor;
      if (x < c0 || x > c1 + 1 || y < r0 || y > r1 + 1) continue;
      const { sx, sy } = ctx.camera.worldToScreen(x, y);
      this.lanes.set(lane, placeFrame(ctx, this.map.lanes[lane].sealed, 'ground', sx, sy, { sortY: 3 }));
    }
  }

  /** Open lanes show violet chevrons; sealed lanes an amber hard-light gate (§3.1). */
  setLane(lane: LaneId, state: LaneState) {
    const a = this.lanes.get(lane);
    if (a) this.ctx.lib.setFrame(a, this.map.lanes[lane][state]);
  }
}
