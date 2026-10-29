// Screen geometry for the TV's DOM overlay (SPEC §15.2 band table, §2.3 TV-safe margin). Everything
// is in the 1920 × 1080 logical canvas; the overlay root scales to the window with a CSS transform.

export const CANVAS = { w: 1920, h: 1080 } as const;
/** `--space-tv-safe` (brand.css): nothing but edge washes may touch the outer 96 px. */
export const SAFE = 96;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const box = (x0: number, y0: number, x1: number, y1: number): Box => ({
  x: x0,
  y: y0,
  w: x1 - x0,
  h: y1 - y0,
});

/** The TV-safe rectangle. */
export const SAFE_BOX: Box = box(SAFE, SAFE, CANVAS.w - SAFE, CANVAS.h - SAFE);

/** Playfield: 36 × 24 sim tiles of 48 px wide and 28.8 px deep (SPEC §2.5, §15.2). */
const TILE_W = 48;
const TILE_D = 28.8;
const PLAY_Y0 = 216;
const PLAY_Y1 = Math.round(PLAY_Y0 + 24 * TILE_D);

/** SPEC §15.2 "Screen layout" table, by band. */
export const BANDS = {
  topMargin: box(0, 0, CANVAS.w, 96),
  topHud: box(SAFE, 96, CANVAS.w - SAFE, 136),
  headroom: box(SAFE, 136, CANVAS.w - SAFE, PLAY_Y0),
  playfield: box(SAFE, PLAY_Y0, CANVAS.w - SAFE, PLAY_Y1),
  bottomHud: box(SAFE, PLAY_Y1, CANVAS.w - SAFE, 984),
  bottomMargin: box(0, 984, CANVAS.w, CANVAS.h),
} as const;

/** Citadel footprint is cols 16–19, so the base bar centers on x = 96 + 18 · 48 = 960. */
export const CITADEL_CENTER_X = SAFE + 18 * TILE_W;

/** Right side of the playfield, where the build phase's ready status and wishlist overlay (§2.6). */
export const SIDE_PANEL = box(CANVAS.w - SAFE - 336, 176, CANVAS.w - SAFE, 800);

/** Lane entries (SPEC §15.2 Map v1): tile rect of the entry, for the violet edge bands (§2.6). */
const LANE_TILES = {
  bottom: { col: 17, row: 23, cols: 2, rows: 1 },
  left: { col: 0, row: 11, cols: 1, rows: 2 },
  right: { col: 35, row: 11, cols: 1, rows: 2 },
} as const;

export type LaneKey = keyof typeof LANE_TILES;

/** Edge band for a lane: a gradient strip ending at the screen edge, 3 tiles either side of the entry. */
export function laneBand(lane: LaneKey): Box & { edge: 'bottom' | 'left' | 'right' } {
  const t = LANE_TILES[lane];
  const x = SAFE + t.col * TILE_W;
  const y = PLAY_Y0 + t.row * TILE_D;
  if (lane === 'bottom') {
    const pad = 3 * TILE_W;
    return { ...box(x - pad, CANVAS.h - 56, x + t.cols * TILE_W + pad, CANVAS.h), edge: 'bottom' };
  }
  const pad = 3 * TILE_D;
  const y0 = Math.round(y - pad);
  const y1 = Math.round(y + t.rows * TILE_D + pad);
  return lane === 'left'
    ? { ...box(0, y0, 64, y1), edge: 'left' }
    : { ...box(CANVAS.w - 64, y0, CANVAS.w, y1), edge: 'right' };
}

/** Uniform FIT scale of the 1920 × 1080 root into a window, and its letterbox offset. */
export function fitScale(winW: number, winH: number): { scale: number; x: number; y: number } {
  const scale = Math.min(winW / CANVAS.w, winH / CANVAS.h);
  return { scale, x: (winW - CANVAS.w * scale) / 2, y: (winH - CANVAS.h * scale) / 2 };
}

export const insideSafe = (b: Box, eps = 0.5): boolean =>
  b.x >= SAFE_BOX.x - eps &&
  b.y >= SAFE_BOX.y - eps &&
  b.x + b.w <= SAFE_BOX.x + SAFE_BOX.w + eps &&
  b.y + b.h <= SAFE_BOX.y + SAFE_BOX.h + eps;
