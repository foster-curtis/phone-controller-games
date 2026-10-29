// The v1 fixed camera (SPEC §3.2, §15.2): the whole 36 × 24 map, projected per §2.5. Every
// world-to-screen conversion goes through a Camera, so v2's dynamic camera is a new implementation.
import type { Camera, ScreenPoint } from './types';

/** Tile width W in screen px at k = 1 (§2.5). */
export const TILE_W = 48;
/** Ground depth ratio: a tile is W wide and 0.6 W deep. */
export const GROUND_SQUASH = 0.6;
/** Screen px per sprite unit at k = 1: art tiles are 80 units wide (§2.5). */
export const UNIT_PX = TILE_W / 80;
/** Playfield origin (top-left of tile 0,0), inside the TV-safe margin and the top HUD (§15.2). */
export const ORIGIN_X = 96;
export const ORIGIN_Y = 216;
export const CANVAS_W = 1920;
export const CANVAS_H = 1080;

export class FixedCamera implements Camera {
  readonly scale = 1;

  /** sx = 96 + x·W, sy = 216 + y·W·0.6 − z·W. */
  worldToScreen(x: number, y: number, z = 0): ScreenPoint {
    return {
      sx: ORIGIN_X + x * TILE_W * this.scale,
      sy: ORIGIN_Y + (y * GROUND_SQUASH - z) * TILE_W * this.scale,
    };
  }

  groundEllipse(r: number): { rx: number; ry: number } {
    const rx = r * TILE_W * this.scale;
    return { rx, ry: rx * GROUND_SQUASH };
  }

  update(_dtMs: number, _focus: readonly { x: number; y: number }[]): void {}
}
