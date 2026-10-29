// Status looks (SPEC §6.1; art README "Status effects"): burn flames and poison corrosion loop at
// about 8 fps, anchored bottom-center on the body and scaled to its height; stun turns the glow off
// (unlit frames) and loops amber chevrons centered on the `top` point; slow crawls arcs up the legs.
import type { ArtImage } from './atlas';
import { placeFrame, type RenderContext } from './context';
import { STATUS_FRAMES } from './keys';
import type { RigInstance, StatusLook } from './types';

const FPS = 8;
/** Frame heights in sprite units (burn/corrosion ≈ 38–42, crawl 52), for scaling to the body. */
const BODY_FRAME_H = 40;
const CRAWL_FRAME_H = 46;

export class StatusSprites {
  private imgs = new Map<StatusLook, ArtImage>();
  private t = 0;

  constructor(
    private readonly ctx: RenderContext,
    private readonly rig: RigInstance,
    /** Body height and leg height in sprite units (from the rig's art). */
    private readonly bodyH: number,
    private readonly legH: number,
  ) {}

  set(looks: readonly StatusLook[]) {
    const want = new Set(looks);
    for (const [look, a] of this.imgs) {
      if (!want.has(look)) {
        a.img.destroy();
        this.imgs.delete(look);
      }
    }
    for (const look of want) {
      if (this.imgs.has(look)) continue;
      const layer = 'effects';
      this.imgs.set(look, placeFrame(this.ctx, STATUS_FRAMES[look][0], layer, 0, 0));
    }
    this.rig.setUnlit(want.has('stun'));
  }

  /** Place on the rig; `foot` is the rig's foot point on screen. */
  update(dtMs: number, footSx: number, footSy: number) {
    this.t += dtMs;
    const frame = Math.floor((this.t / 1000) * FPS);
    const k = this.ctx.unitPx;
    for (const [look, a] of this.imgs) {
      const frames = STATUS_FRAMES[look];
      this.ctx.lib.setFrame(a, frames[frame % frames.length]!);
      if (look === 'stun') {
        const top = this.rig.attach('top') ?? { sx: footSx, sy: footSy - this.bodyH * k };
        this.ctx.lib.setUnitScale(a, k);
        a.img.setPosition(top.sx, top.sy - 6);
      } else if (look === 'slow') {
        this.ctx.lib.setUnitScale(a, k, 1, this.legH / CRAWL_FRAME_H);
        a.img.setPosition(footSx, footSy);
      } else {
        const s = this.bodyH / BODY_FRAME_H;
        this.ctx.lib.setUnitScale(a, k, s, s * 0.9);
        a.img.setPosition(footSx, footSy - 4 * k);
      }
    }
  }

  destroy() {
    for (const a of this.imgs.values()) a.img.destroy();
    this.imgs.clear();
  }
}
