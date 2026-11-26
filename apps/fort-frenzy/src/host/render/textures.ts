// Shared generated textures (SPEC §15.2; RD5), made once per scene and only scaled afterwards: the soft
// shadow ellipse and the faint dotted ring a build's effect radius is drawn with. No Phaser import, so
// the pieces that use them test headless.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';

export const SHADOW_TEXTURE = '__ff-shadow';
export const DOTTED_RING_TEXTURE = '__ff-dotted-ring';

/** The dotted ring texture is this wide (px); it scales to `2 · rx`. Height is 0.6 of it (§2.5). */
export const DOTTED_RING_W = 256;
const DOTS = 36;
/** Faint: it lies on the ground under the units and stays below the bloom threshold. */
const DOT_ALPHA = 0.5;

/** A faint dotted amber 0.6 ellipse (SPEC §7.5), unit-sized to `DOTTED_RING_W` wide. */
export function ensureDottedRing(scene: Phaser.Scene) {
  if (scene.textures.exists(DOTTED_RING_TEXTURE)) return;
  const w = DOTTED_RING_W;
  const h = Math.ceil(w * 0.6);
  const g = scene.make.graphics({}, false);
  g.fillStyle(theme.color.amber.num, DOT_ALPHA);
  for (let i = 0; i < DOTS; i++) {
    const a = (i / DOTS) * Math.PI * 2;
    g.fillCircle(w / 2 + Math.cos(a) * (w / 2 - 3), h / 2 + Math.sin(a) * (h / 2 - 3), 2.2);
  }
  g.generateTexture(DOTTED_RING_TEXTURE, w, h);
  g.destroy();
}

/** An image of a texture by key (`scene.make.image` takes `key` at runtime; its typing omits it). */
export function makeImage(scene: Phaser.Scene, key: string): Phaser.GameObjects.Image {
  return scene.make.image({ key } as Phaser.Types.GameObjects.GameObjectConfig, false);
}
