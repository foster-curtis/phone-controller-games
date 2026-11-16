// Shared pieces of the How to play pictures (SPEC §6.9): the small TV pan used beside the phone on
// cards 2 and 3, the fall-off-the-rim motion and the winner's crown. Theme tokens only.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import type { SimSnapshot } from '../sim/types';
import { backOut, easeInQuad, phase } from './timeline';

/** The TV side of a split frame (illustration box coordinates). */
export const TV_PANE = { x: 480, y: 60, w: 450, h: 420 };
/** The small pan: drawn at its real look (drawArena) in a graphics scaled by `PAN_SCALE`. */
export const PAN_RADIUS = 130;
export const PAN_SCALE = 0.75;
export const PAN_CENTER = { x: 612, y: 255 };
export const PAN_EGG_RADIUS = 36;
export const PAN_ARENA: SimSnapshot['arena'] = {
  radius: PAN_RADIUS,
  startRadius: PAN_RADIUS,
  shrinking: false,
};

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

/** A little crown centered at (x, y) (its base), popping in with `pop` 0..1. */
export function drawCrown(g: Phaser.GameObjects.Graphics, x: number, y: number, pop: number): void {
  if (pop <= 0) return;
  const s = backOut(pop);
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
