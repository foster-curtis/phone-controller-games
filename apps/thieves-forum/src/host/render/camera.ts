// The fixed camera (SPEC §12.2, §6.3): the whole 40 × 37.5-tile market on the 1920 × 1080 canvas,
// Fort Frenzy's oblique projection (ground factor 0.6). Every world-to-screen conversion goes
// through a `Camera`. Adapted from Fort Frenzy (`src/host/render/camera.ts`): copied from Fort
// Frenzy, extraction candidate, BUILD_PLAN §8.
import type { Vec2 } from '../../content/types';
import type { Camera } from './types';

export const CANVAS_W = 1920;
export const CANVAS_H = 1080;
/** Tile width in screen px (SPEC §12.2). */
export const TILE_PX = 48;
export const GROUND_FACTOR = 0.6;
/**
 * Screen px per character rig unit: the 60-unit viewBox stands about 108 px, 1/10 of the screen
 * (SPEC §12.2, §6.3), and the layout reference draws characters 24 × 36 at ×3 (BUILD_PLAN §8).
 */
export const CHAR_UNIT_PX = 1.8;
/** Screen px per stall, gate and stocks unit: the 640 × 360 layout reference ×3 (SPEC §12.4). */
export const MAP_UNIT_PX = 3;

export class FixedCamera implements Camera {
  readonly tilePx = TILE_PX;
  readonly groundFactor = GROUND_FACTOR;

  constructor(private readonly origin: Vec2 = { x: 0, y: 0 }) {}

  toScreen(p: Vec2, z = 0): Vec2 {
    return {
      x: this.origin.x + p.x * TILE_PX,
      y: this.origin.y + (p.y * GROUND_FACTOR - z) * TILE_PX,
    };
  }

  toWorld(s: Vec2): Vec2 {
    return {
      x: (s.x - this.origin.x) / TILE_PX,
      y: (s.y - this.origin.y) / (TILE_PX * GROUND_FACTOR),
    };
  }

  depth(p: Vec2): number {
    return this.toScreen(p).y;
  }
}
