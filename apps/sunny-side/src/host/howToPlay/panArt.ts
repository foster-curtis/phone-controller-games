// Shared pieces of the How to play pictures (SPEC §6.9): the one counter backdrop and pan framing
// every card uses, the small TV pan beside the phone on cards 2 and 3, the fall-off-the-rim motion
// and the winner's crown. Theme tokens only.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import { drawCounter } from '../render/arena';
import type { SimSnapshot } from '../sim/types';
import { backOut, easeInQuad, phase } from './timeline';

/**
 * The big pan used by cards 1, 4, 5 and 6: drawn at game scale (radius `r`, handle included) in a
 * graphics scaled by `k`, centered so the whole pan with its handle sits inside the 960x540 box
 * (at `k` it spans about 230 left and 410 right of `cx`, 230 up and down).
 */
export const BIG_PAN = { cx: 390, cy: 270, k: 0.66, r: 330, eggR: 56 };

/** The TV side of a split frame (illustration box coordinates). */
export const TV_PANE = { x: 450, y: 60, w: 480, h: 420 };
/** The small pan: drawn at its real look (drawArena) in a graphics scaled by `PAN_SCALE`. */
export const PAN_RADIUS = 130;
export const PAN_SCALE = 0.74;
/** Placed so the pan with its handle is centered in the TV pane (about 110 left, 321 right of it). */
export const PAN_CENTER = { x: 585, y: 270 };
export const PAN_EGG_RADIUS = 44;
export const PAN_ARENA: SimSnapshot['arena'] = {
  radius: PAN_RADIUS,
  startRadius: PAN_RADIUS,
  shrinking: false,
};

/**
 * The backdrop every card shares: cream counter tiles filling the box. `ringAt` adds the burner
 * ring around a pan centered there (box coordinates); without it the ring is parked off-screen.
 */
export function addBackdrop(
  scene: Phaser.Scene,
  ringAt?: { x: number; y: number; r: number },
): Phaser.GameObjects.Graphics {
  const bg = scene.add.graphics().setScale(0.5);
  if (ringAt) drawCounter(bg, ringAt.x * 2, ringAt.y * 2, ringAt.r * 2);
  else drawCounter(bg, -5000, -5000, 1);
  return bg;
}

/** Backdrop plus the big pan's layer: draw the pan and eggs around (0, 0) in game units. */
export function addBigPanLayer(scene: Phaser.Scene): {
  bg: Phaser.GameObjects.Graphics;
  g: Phaser.GameObjects.Graphics;
} {
  const { cx, cy, k, r } = BIG_PAN;
  const bg = addBackdrop(scene, { x: cx, y: cy, r: r * k });
  const g = scene.add.graphics().setPosition(cx, cy).setScale(k);
  return { bg, g };
}

/** A point in the big pan's local game units, as illustration-box coordinates. */
export function boxPoint(p: { x: number; y: number }): { x: number; y: number } {
  return { x: BIG_PAN.cx + p.x * BIG_PAN.k, y: BIG_PAN.cy + p.y * BIG_PAN.k };
}

/** A knocked-off egg dropping away: extra y, scale and alpha at `t` (stays 0/1/1 before `start`). */
export function fall(t: number, start: number, durMs = 700) {
  const f = phase(t, start, start + durMs);
  return { dy: easeInQuad(f) * 260, scale: 1 - 0.5 * f, alpha: 1 - f };
}

/** The TV frame: a sticker panel with a hard shadow. */
export function drawTvPane(g: Phaser.GameObjects.Graphics): void {
  const { x, y, w, h } = TV_PANE;
  const sh = theme.shadow.sticker;
  const edge = theme.stroke.sticker;
  g.fillStyle(sh.color.num, 1);
  g.fillRoundedRect(x + sh.x, y + sh.y, w, h, theme.radius.sticker);
  g.fillStyle(theme.color.cream.num, 1);
  g.fillRoundedRect(x, y, w, h, theme.radius.sticker);
  g.lineStyle(edge, theme.color.stickerOutline.num, 1);
  g.strokeRoundedRect(x, y, w, h, theme.radius.sticker);
}

/** A little crown centered at (x, y) (its base), popping in with `pop` 0..1; `size` scales it. */
export function drawCrown(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  pop: number,
  size = 1,
): void {
  if (pop <= 0) return;
  const s = backOut(pop) * size;
  const w = 34 * s;
  const h = 26 * s;
  const pts = [
    { x: x - w, y },
    { x: x - w, y: y - h * 0.7 },
    { x: x - w / 2, y: y - h * 0.3 },
    { x, y: y - h },
    { x: x + w / 2, y: y - h * 0.3 },
    { x: x + w, y: y - h * 0.7 },
    { x: x + w, y },
  ] as unknown as Phaser.Math.Vector2[];
  g.fillStyle(theme.color.yolk.num, 1);
  g.fillPoints(pts, true, true);
  g.lineStyle(theme.stroke.sticker, theme.color.stickerOutline.num, 1);
  g.strokePoints(pts, true, true);
}
