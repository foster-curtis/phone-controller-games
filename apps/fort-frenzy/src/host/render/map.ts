// Map ground (SPEC §3.1, §15.2 Map v1): stone tiles (variant 1 on most, 2–4 sparsely by a seeded
// hash of the tile, so the ground is stable run to run), border edges except on portal tiles, the six
// idle portal frames at the edge entries, and sparse flat decor. All on layer 1. `floorLift`
// lightens the tiles, edges and decor at draw time (C3 floor contrast, BUILD_PLAN §8 FF3-fix-2).
import type * as Phaser from 'phaser';
import { mapV1 } from '../../content/map';
import type { PortalId, SideId } from '../../shared/ids';
import type { PresentationHost } from '../../presentation/types';
import type { ArtImage } from './atlas';
import { placeFrame, type RenderContext } from './context';
import type { EffectSpawner } from './types';

/** `Phaser.TintModes.ADD`, as a literal so node tests that import `tileHash` don't load Phaser. */
const TINT_ADD = 2 as Phaser.TintModes;

export const MAP_COLS = 36;
export const MAP_ROWS = 24;

/**
 * Portal entry tiles (map v1) and each portal's frame anchor in world tiles: the edge midpoint
 * between its two entry tiles (§15.2). Every bottom portal uses the bottom frames, side portals their
 * side's.
 */
export const PORTALS: {
  id: PortalId;
  side: SideId;
  tiles: [number, number][];
  anchor: [number, number];
}[] = (Object.entries(mapV1.portals) as [PortalId, (typeof mapV1.portals)[PortalId]][]).map(
  ([id, { side, entry }]) => {
    const tiles = entry.map(([c, r]) => [c, r] as [number, number]);
    const mid = (i: 0 | 1) => tiles.reduce((a, t) => a + t[i] + 0.5, 0) / tiles.length;
    const anchor: [number, number] =
      side === 'bottom' ? [mid(0), tiles[0]![1] + 1] : [tiles[0]![0] + 0.5, mid(1)];
    return { id, side, tiles, anchor };
  },
);

/** A stable 32-bit hash of a tile and a salt (render variety without randomness). */
export function tileHash(c: number, r: number, salt = 0): number {
  let h =
    (Math.imul(c + 1, 0x9e3779b1) ^
      Math.imul(r + 1, 0x85ebca77) ^
      Math.imul(salt + 1, 0xc2b2ae3d)) >>>
    0;
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

const isPortalTile = (c: number, r: number) =>
  PORTALS.some((p) => p.tiles.some(([pc, pr]) => pc === c && pr === r));

export class MapView {
  private images: ArtImage[] = [];
  /** Each portal's frame image and its screen anchor, for the flare (§3.1, RD5). */
  private readonly portals = new Map<
    PortalId,
    { art: ArtImage; side: SideId; sx: number; sy: number }
  >();
  private readonly flaring = new Set<PortalId>();

  constructor(
    private readonly ctx: RenderContext & { fx?: EffectSpawner },

    private readonly map: PresentationHost['map'],
    /** Draw only this tile window (the gallery's map sample); default the whole map. */
    readonly window: { c0: number; r0: number; c1: number; r1: number } = {
      c0: 0,
      r0: 0,
      c1: MAP_COLS - 1,
      r1: MAP_ROWS - 1,
    },
  ) {
    const { c0, r0, c1, r1 } = window;
    const lift = map.floorLift;
    // Layer-1 order: tiles (row by row), decor, edges, portals; the Citadel plate sorts after them.
    const at = (name: string, c: number, r: number, base: number) => {
      const { sx, sy } = ctx.camera.worldToScreen(c + 0.5, r + 0.5);
      const a = placeFrame(ctx, name, 'ground', sx, sy, { sortY: base + r * 0.01 });
      // The floor lift (C3, FF3-fix-2) adds to every channel, so seams, hash variety and the rim
      // keep their steps; portals stay untinted (their glows keep their colors).
      if (lift) a.img.setTintMode(TINT_ADD).setTint(lift);
      this.images.push(a);
    };
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++)
        at(this.map.ground[groundVariant(c, r) - 1] ?? this.map.ground[0]!, c, r, 0);
    }
    const decor = this.map.decor ?? [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const h = tileHash(c, r, 7);
        if (decor.length > 0 && h % 100 < 3 && !edgeFor(c, r))
          at(decor[h % decor.length]!, c, r, 1);
      }
    }
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const e = edgeFor(c, r);
        if (e && !isPortalTile(c, r))
          at(this.map.edges[e as keyof PresentationHost['map']['edges']], c, r, 2);
      }
    }
    for (const { id, side, anchor } of PORTALS) {
      const [x, y] = anchor;
      if (x < c0 || x > c1 + 1 || y < r0 || y > r1 + 1) continue;
      const { sx, sy } = ctx.camera.worldToScreen(x, y);
      const art = placeFrame(ctx, this.map.portals[side].idle, 'ground', sx, sy, { sortY: 3 });
      this.images.push(art);
      this.portals.set(id, { art, side, sx, sy });
    }
  }

  /**
   * A portal flares (SPEC §3.1, §9.4): its `flare` frame (vortex lit, light column) and the
   * `portal-flare` sparks at the frame's `center` attach point for `ms`; `idle()` swaps it back.
   * One frame swap each way, not per frame.
   */
  flare(id: PortalId, ms: number) {
    const p = this.portals.get(id);
    if (!p) return;
    const frame = this.map.portals[p.side].flare;
    if (!this.flaring.has(id)) {
      this.flaring.add(id);
      this.ctx.lib.setFrame(p.art, frame);
      this.ctx.lib.setUnitScale(p.art, this.ctx.unitPx);
    }
    const c = this.ctx.lib.frames[frame]?.attach?.center ?? [0, 0];
    const k = this.ctx.unitPx;
    this.ctx.fx?.mark?.('portal-flare', p.sx + c[0] * k, p.sy + c[1] * k, ms);
  }

  /** Back to the idle swirl. */
  idle(id: PortalId) {
    const p = this.portals.get(id);
    if (!p || !this.flaring.delete(id)) return;
    this.ctx.lib.setFrame(p.art, this.map.portals[p.side].idle);
    this.ctx.lib.setUnitScale(p.art, this.ctx.unitPx);
  }
}
