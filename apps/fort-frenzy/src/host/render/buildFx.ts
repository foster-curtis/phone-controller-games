// The build sketch and fill and the destroyed collapse (SPEC §7.2; FF8), on any structure's images or
// rig. Alpha, crop and scale only (no texture redraws per frame).
import * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import type { ArtImage } from './atlas';
import type { RenderContext } from './context';
import type { RigSprite } from './rig';
import { buildPhase, collapseAt } from './structureFx';

/**
 * The build (§7.2): an amber sketch of each image (a tinted copy on the effects layer) appears, then
 * the real image fills from the plate up (cropped from the bottom). A rig grows from its foot.
 * Alpha, crop and scale only; the copies are destroyed when it ends.
 */
export class BuildFill {
  private t = 0;
  private sketches: ArtImage[] = [];
  private readonly rigScale: [number, number] | null;

  constructor(
    ctx: RenderContext,
    private readonly images: () => ArtImage[],
    private readonly rig: RigSprite | null = null,
    /** Hidden until the builder's hands reach the ground, ms. */
    delayMs = 0,
  ) {
    this.t = -delayMs;
    for (const a of images()) {
      const s = ctx.lib.image(a.name, a.origin);
      s.img
        .setPosition(a.img.x, a.img.y)
        .setScale(a.img.scaleX, a.img.scaleY)
        .setDepth(a.img.depth)
        .setTintMode(Phaser.TintModes.FILL)
        .setTint(theme.color.amber.num);
      ctx.layers.effects.add(s.img);
      this.sketches.push(s);
    }
    this.rigScale = rig ? [rig.root.scaleX, rig.root.scaleY] : null;
    this.update(0);
  }

  /** Advances; false once done (and cleaned up). */
  update(dtMs: number): boolean {
    this.t += dtMs;
    const ph = buildPhase(this.t);
    for (const s of this.sketches) s.img.setAlpha(this.t < 0 ? 0 : ph.sketch);
    for (const a of this.images()) {
      const h = a.img.frame.realHeight;
      const w = a.img.frame.realWidth;
      if (ph.done) a.img.setCrop();
      else a.img.setCrop(0, h * (1 - ph.fill), w, h * ph.fill);
    }
    if (this.rig && this.rigScale) {
      const [sx, sy] = this.rigScale;
      this.rig.root.setScale(sx, sy * Math.max(0.02, ph.done ? 1 : ph.fill));
      this.rig.setAlpha(ph.done ? 1 : Math.max(0.2, ph.fill));
    }
    if (ph.done) this.destroy();
    return !ph.done;
  }

  destroy() {
    for (const s of this.sketches) s.img.destroy();
    this.sketches = [];
  }
}

/**
 * Destroyed (§7.2): unlit copies of the structure's images sink into the plate and fade while scrap
 * lands; the originals can go at once.
 */
export class Collapse {
  private t = 0;
  private copies: { a: ArtImage; sx: number; sy: number }[] = [];

  constructor(ctx: RenderContext, images: readonly ArtImage[]) {
    for (const src of images) {
      const a = ctx.lib.image(src.name, src.origin, true);
      a.img.setPosition(src.img.x, src.img.y).setScale(src.img.scaleX, src.img.scaleY);
      a.img.setDepth(src.img.depth);
      // Same layer as the original (rails and plates stay on the ground).
      const layer = src.img.displayList as Phaser.GameObjects.Layer | null;
      if (layer) layer.add(a.img);
      else ctx.layers.world.add(a.img);
      this.copies.push({ a, sx: src.img.scaleX, sy: src.img.scaleY });
    }
  }

  update(dtMs: number): boolean {
    this.t += dtMs;
    const f = collapseAt(this.t);
    for (const c of this.copies) c.a.img.setScale(c.sx, c.sy * f.sy).setAlpha(f.alpha);
    if (f.done) {
      for (const c of this.copies) c.a.img.destroy();
      this.copies = [];
    }
    return !f.done;
  }
}
