// Spectator emoji (SPEC §6.6): pop in on the side of the screen, float to the top, fade out.
// Capped at 12 on screen; the oldest drops first. Pure state + a Phaser renderer.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import { SAFE_RECT, hudLayout } from './layout';

export const EMOJI_CAP = 12;
export const EMOJI_LIFE_MS = 3500;
/** Fraction of the lifetime after which the emoji starts fading. */
export const EMOJI_FADE_FROM = 0.55;
export const EMOJI_SIZE = 56;

export interface EmojiItem {
  id: number;
  glyph: string;
  x: number;
  startY: number;
  endY: number;
  start: number;
}

export interface EmojiFrame {
  id: number;
  glyph: string;
  x: number;
  y: number;
  alpha: number;
}

export class EmojiLayer {
  private items: EmojiItem[] = [];
  private seq = 0;

  /** Pops an emoji in on alternating sides; drops the oldest beyond the cap. */
  spawn(glyph: string, now: number): EmojiItem {
    const lanes = hudLayout(0).emojiLanes;
    const n = this.seq++;
    const lane = n % 2 === 0 ? lanes.left : lanes.right;
    const slot = Math.floor(n / 2) % 4;
    const item: EmojiItem = {
      id: n,
      glyph,
      x: lane.x + EMOJI_SIZE / 2 + slot * ((lane.w - EMOJI_SIZE) / 3),
      startY: SAFE_RECT.y + SAFE_RECT.h - EMOJI_SIZE / 2,
      endY: SAFE_RECT.y + EMOJI_SIZE / 2,
      start: now,
    };
    this.items.push(item);
    while (this.items.length > EMOJI_CAP) this.items.shift();
    return item;
  }

  /** Drops expired items. */
  prune(now: number): void {
    this.items = this.items.filter((i) => now - i.start < EMOJI_LIFE_MS);
  }

  count(): number {
    return this.items.length;
  }

  /** Visible emoji at `now`: rising linearly over the lifetime, fading out at the end. */
  frames(now: number): EmojiFrame[] {
    this.prune(now);
    return this.items.map((i) => {
      const t = Math.min(1, Math.max(0, (now - i.start) / EMOJI_LIFE_MS));
      const alpha = t < EMOJI_FADE_FROM ? 1 : 1 - (t - EMOJI_FADE_FROM) / (1 - EMOJI_FADE_FROM);
      return {
        id: i.id,
        glyph: i.glyph,
        x: i.x + Math.sin(t * 9 + i.id) * 10,
        y: i.startY + (i.endY - i.startY) * t,
        alpha,
      };
    });
  }

  clear(): void {
    this.items = [];
  }
}

/** Phaser renderer for an EmojiLayer: a pooled Text per live emoji. */
export class EmojiRenderer {
  private readonly texts = new Map<number, Phaser.GameObjects.Text>();

  constructor(private readonly scene: Phaser.Scene) {}

  render(layer: EmojiLayer, now: number): void {
    const frames = layer.frames(now);
    const live = new Set<number>();
    for (const f of frames) {
      live.add(f.id);
      let t = this.texts.get(f.id);
      if (!t) {
        t = this.scene.add
          .text(0, 0, f.glyph, { fontFamily: theme.emojiFont, fontSize: `${EMOJI_SIZE}px` })
          .setOrigin(0.5)
          .setDepth(3);
        this.texts.set(f.id, t);
      }
      t.setPosition(f.x, f.y).setAlpha(f.alpha);
    }
    for (const [id, t] of this.texts) {
      if (!live.has(id)) {
        t.destroy();
        this.texts.delete(id);
      }
    }
  }

  destroy(): void {
    for (const t of this.texts.values()) t.destroy();
    this.texts.clear();
  }
}
