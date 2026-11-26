// The v1 fixed camera (SPEC §3.2, §15.2): the whole 36 × 24 map fitted just inside the view width,
// projected per §2.5. Every world-to-screen conversion goes through a Camera, so v2's dynamic camera
// is a new implementation.
import { GROUND_SQUASH } from '../../shared/projection';
import type { Camera, ScreenPoint } from './types';

/** Ground depth ratio: a tile is W wide and 0.6 W deep (shared with the sim's body hitboxes). */
export { GROUND_SQUASH };
/** Tile width W in screen px at k = 1 (§2.5, the art's reference scale). */
export const TILE_W = 48;
/** Screen px per sprite unit at k = 1: art tiles are 80 units wide (§2.5). */
export const UNIT_PX = TILE_W / 80;
export const CANVAS_W = 1920;
export const CANVAS_H = 1080;

/** Map size in tiles (map.ts; mirrored here so the fit has no content import). */
const MAP_COLS = 36;
const MAP_ROWS = 24;
/**
 * TUNING (RD5-fix-4): the empty strip kept on each side of the map, as a fraction of the view width,
 * so the map is just barely narrower than the view (1% = 19.2 px each side at 1920).
 */
export const MAP_SIDE_MARGIN = 0.01;
/** §15.2 band lines on the 1920 × 1080 canvas: the top HUD ends at 136, the TV-safe bottom is 984. */
const HUD_BOTTOM = 136;
const SAFE_BOTTOM_INSET = 96;
/** Headroom the Citadel's keep needs above the map's top edge at k = 1 (it scales with the map). */
const CITADEL_HEADROOM = 80;

export interface MapFit {
  /** Zoom k: tile width / 48 (1 = the v1 fit on the 1920 × 1080 canvas). */
  scale: number;
  tileW: number;
  originX: number;
  originY: number;
  /** Drawn map size in view px. */
  mapW: number;
  mapH: number;
  /** What bounds the scale: the side margin (width) or the bottom safe line (height). */
  limit: 'width' | 'height';
}

/**
 * The TV's world fit for a 16:9 view of viewW × viewH px (SPEC §15.2): the map is as wide as the view
 * less MAP_SIDE_MARGIN each side, centered, below the top HUD plus the scaled Citadel headroom, unless
 * that would push the map's bottom past the TV-safe line, then the largest scale that keeps it there.
 */
export function fitMap(viewW: number, viewH: number): MapFit {
  const s = Math.min(viewW / CANVAS_W, viewH / CANVAS_H);
  const byWidth = (viewW * (1 - 2 * MAP_SIDE_MARGIN)) / MAP_COLS;
  // top = HUD_BOTTOM·s + headroom·tile/48, and top + rows·0.6·tile ≤ view bottom − safe inset
  const byHeight =
    (viewH - (SAFE_BOTTOM_INSET + HUD_BOTTOM) * s) /
    (MAP_ROWS * GROUND_SQUASH + CITADEL_HEADROOM / TILE_W);
  const tileW = Math.min(byWidth, byHeight);
  const mapW = tileW * MAP_COLS;
  return {
    scale: tileW / TILE_W,
    tileW,
    originX: (viewW - mapW) / 2,
    originY: HUD_BOTTOM * s + (CITADEL_HEADROOM / TILE_W) * tileW,
    mapW,
    mapH: tileW * MAP_ROWS * GROUND_SQUASH,
    limit: byWidth <= byHeight ? 'width' : 'height',
  };
}

type FitOrigin = Pick<MapFit, 'scale' | 'originX' | 'originY'>;

/** The TV's fit on the logical canvas (the camera's default; the CSS transform scales it to the window). */
export const TV_FIT: FitOrigin = fitMap(CANVAS_W, CANVAS_H);
/** The v1 unscaled fit (k = 1, origin 96, 216), kept for the art gallery's hand-placed pages. */
export const UNIT_FIT: FitOrigin = { scale: 1, originX: 96, originY: 216 };

export class FixedCamera implements Camera {
  readonly scale: number;
  private readonly ox: number;
  private readonly oy: number;

  constructor(fit: FitOrigin = TV_FIT) {
    this.scale = fit.scale;
    this.ox = fit.originX;
    this.oy = fit.originY;
  }

  /** sx = originX + x·W·k, sy = originY + (y·0.6 − z)·W·k. */
  worldToScreen(x: number, y: number, z = 0): ScreenPoint {
    return {
      sx: this.ox + x * TILE_W * this.scale,
      sy: this.oy + (y * GROUND_SQUASH - z) * TILE_W * this.scale,
    };
  }

  groundEllipse(r: number): { rx: number; ry: number } {
    const rx = r * TILE_W * this.scale;
    return { rx, ry: rx * GROUND_SQUASH };
  }

  update(_dtMs: number, _focus: readonly { x: number; y: number }[]): void {}
}
