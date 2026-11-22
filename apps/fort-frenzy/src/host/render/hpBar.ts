// World HP bars (SPEC §2.6; RD5): a thin ink-backed bar above a damaged enemy (violet fill) or an HP
// build (amber fill). Two images of Phaser's white texture, made once and only moved and scaled each
// frame (the frame-cost rule, §15.2: no Graphics clear and no texture upload per frame).
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import type { RenderContext } from './context';
import { makeImage } from './textures';

const WHITE = '__WHITE';
export const HP_BAR_H = 5;
const BACK_ALPHA = 0.85;

export class HpBar {
  private readonly back: Phaser.GameObjects.Image;
  private readonly fill: Phaser.GameObjects.Image;
  private shown = false;

  constructor(
    ctx: RenderContext,
    fillColor: number,
    private readonly widthPx: number,
    private readonly heightPx = HP_BAR_H,
  ) {
    const make = (color: number, alpha: number, originX: number) => {
      const img = makeImage(ctx.scene, WHITE);
      img.setOrigin(originX, 0.5).setTint(color).setAlpha(alpha).setVisible(false);
      ctx.layers.worldUi.add(img);
      return img;
    };
    this.back = make(theme.color.brandInk.num, BACK_ALPHA, 0.5);
    this.fill = make(fillColor, 1, 0);
  }

  get visible(): boolean {
    return this.shown;
  }

  /** Draws the bar centered on (sx, sy) at `frac` of its width. */
  set(sx: number, sy: number, frac: number) {
    if (!this.shown) {
      this.shown = true;
      this.back.setVisible(true);
      this.fill.setVisible(true);
    }
    const f = Math.max(0, Math.min(1, frac));
    this.back.setPosition(sx, sy).setDisplaySize(this.widthPx + 2, this.heightPx + 2);
    this.fill
      .setPosition(sx - this.widthPx / 2, sy)
      .setDisplaySize(Math.max(0.5, this.widthPx * f), this.heightPx);
  }

  hide() {
    if (!this.shown) return;
    this.shown = false;
    this.back.setVisible(false);
    this.fill.setVisible(false);
  }

  destroy() {
    this.back.destroy();
    this.fill.destroy();
  }
}
