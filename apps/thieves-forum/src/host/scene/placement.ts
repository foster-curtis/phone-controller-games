// Where the map pieces stand on the 1920 × 1080 canvas (SPEC §6.3, §12.2, §12.4): every position comes
// from `layout.ts` through the camera (BUILD_PLAN §3 "Layout is config"). A stall's 104 × 96 box is
// scaled to its footprint's width and stands with its counter's front edge on the footprint's front
// edge (its y-sort line); the gate and the stocks stand on their rects' front edges.
import type { LayoutDef, StallSlotDef } from '../../content/types';
import { FixedCamera } from '../render/camera';

export const camera = new FixedCamera();

/**
 * The stall box (stall units): width and counter front edge, as `render/stall.ts` STALL_W and
 * STALL_SORT_Y (repeated so this module stays Phaser-free for unit tests).
 */
const STALL_W = 104;
const STALL_SORT_Y = 87;

export interface StallBox {
  /** Top-left of the stall box, screen px. */
  x: number;
  y: number;
  /** Screen px per stall unit. */
  unitPx: number;
  /** The y-sort line (counter front edge), screen px. */
  sortY: number;
}

export function stallBox(slot: StallSlotDef): StallBox {
  const f = slot.footprint;
  const left = camera.toScreen({ x: f.x, y: slot.counterY });
  const right = camera.toScreen({ x: f.x + f.w, y: slot.counterY });
  const unitPx = (right.x - left.x) / STALL_W;
  return { x: left.x, y: left.y - STALL_SORT_Y * unitPx, unitPx, sortY: left.y };
}

/** The anchor (bottom center) of a rect's front edge, screen px. */
export function frontAnchor(r: { x: number; y: number; w: number; h: number }) {
  return camera.toScreen({ x: r.x + r.w / 2, y: r.y + r.h });
}

/** Floor tile origins covering the market (one per tile). */
export function floorTiles(layout: Pick<LayoutDef, 'size'>): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let ty = 0; ty < Math.ceil(layout.size.h); ty++)
    for (let tx = 0; tx < Math.ceil(layout.size.w); tx++) out.push(camera.toScreen({ x: tx, y: ty }));
  return out;
}
