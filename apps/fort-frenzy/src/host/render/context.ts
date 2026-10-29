// What every render piece needs from the world (avoids a cycle through world.ts).
import type * as Phaser from 'phaser';
import type { ArtImage, ArtLibrary } from './atlas';
import type { Camera, LayerId } from './types';
import type { Point } from '../../themes/types';

export interface RenderContext {
  readonly scene: Phaser.Scene;
  readonly lib: ArtLibrary;
  readonly camera: Camera;
  readonly layers: Readonly<Record<LayerId, Phaser.GameObjects.Layer>>;
  /** Screen px per sprite unit (0.6 · camera k). */
  readonly unitPx: number;
}

/** A frame on a layer at a screen point (its anchor, or `origin` units), sorted by `sortY`. */
export function placeFrame(
  ctx: RenderContext,
  name: string,
  layer: LayerId,
  sx: number,
  sy: number,
  opts: { origin?: Point; scale?: number; sortY?: number; unlit?: boolean } = {},
): ArtImage {
  const art = ctx.lib.image(name, opts.origin, opts.unlit);
  ctx.lib.setUnitScale(art, ctx.unitPx, opts.scale ?? 1);
  art.img.setPosition(sx, sy).setDepth(opts.sortY ?? sy);
  ctx.layers[layer].add(art.img);
  return art;
}
