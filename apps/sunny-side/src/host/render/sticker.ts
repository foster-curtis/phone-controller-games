// Sticker styling (SPEC §6.0 / brand): flat fill, ink outline, hard offset shadow. Tokens only.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import type { Rect } from './layout';

export interface StickerOptions {
  radius?: number;
  /** Hard shadow size; `none` skips it. */
  shadow?: 'sticker' | 'stickerSm' | 'none';
  alpha?: number;
}

/** Draws a sticker rectangle (hard shadow, fill, outline) with the given fill color. */
export function drawSticker(
  g: Phaser.GameObjects.Graphics,
  r: Rect,
  fill: number,
  opts: StickerOptions = {},
): void {
  const radius = Math.min(opts.radius ?? theme.radius.sticker, r.w / 2, r.h / 2);
  const alpha = opts.alpha ?? 1;
  const shadow = opts.shadow ?? 'sticker';
  if (shadow !== 'none') {
    const s = theme.shadow[shadow];
    g.fillStyle(s.color.num, alpha);
    g.fillRoundedRect(r.x + s.x, r.y + s.y, r.w, r.h, radius);
  }
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(r.x, r.y, r.w, r.h, radius);
  g.lineStyle(theme.stroke.sticker, theme.color.stickerOutline.num, alpha);
  g.strokeRoundedRect(r.x, r.y, r.w, r.h, radius);
}

/** A pill (fully rounded sticker). */
export function drawPill(
  g: Phaser.GameObjects.Graphics,
  r: Rect,
  fill: number,
  opts: Omit<StickerOptions, 'radius'> = {},
): void {
  drawSticker(g, r, fill, { ...opts, radius: Math.min(theme.radius.pill, r.h / 2) });
}

/** A `surface` panel: the container for scoreboards, QR, breakdown. */
export function drawPanel(g: Phaser.GameObjects.Graphics, r: Rect, strong = false): void {
  drawSticker(g, r, (strong ? theme.color.surfaceStrong : theme.color.surface).num);
}

/** Linear blend between two 0xRRGGBB colors. */
export function lerpColor(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ch = (shift: number) => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * k);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
