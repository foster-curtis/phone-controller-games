// The phone controller drawn small for cards 2 and 3 (SPEC §6.9), in the controller's brand style:
// a landscape phone, the floating joystick, the SLAM button with its charge arc, and a thumb.
// Theme tokens only. Coordinates are illustration-box pixels.
import type * as Phaser from 'phaser';
import { theme, type ColorToken } from '../../shared/theme';

/** The phone's body and where its controls sit. */
export const PHONE = {
  x: 35,
  y: 190,
  w: 420,
  h: 210,
  /** Where the floating stick appears under the thumb (left half). */
  stick: { x: 135, y: 305 },
  stickRadius: 34,
  knobRadius: 15,
  /** Farthest the knob moves from the base center. */
  knobTravel: 20,
  slam: { x: 375, y: 300, r: 32 },
};

const edge = theme.stroke.sticker;

export function drawPhone(g: Phaser.GameObjects.Graphics): void {
  const { x, y, w, h } = PHONE;
  const sh = theme.shadow.sticker;
  g.fillStyle(sh.color.num, 1);
  g.fillRoundedRect(x + sh.x, y + sh.y, w, h, 26);
  g.fillStyle(theme.color.surfaceStrong.num, 1);
  g.fillRoundedRect(x, y, w, h, 26);
  g.lineStyle(edge, theme.color.stickerOutline.num, 1);
  g.strokeRoundedRect(x, y, w, h, 26);
  // Screen.
  g.fillStyle(theme.color.background.num, 1);
  g.fillRoundedRect(x + 12, y + 12, w - 24, h - 24, 16);
  // The left half is the stick's touch area.
  g.lineStyle(2, theme.color.border.num, 1);
  g.lineBetween(x + w / 2, y + 24, x + w / 2, y + h - 24);
}

/** Floating joystick: base ring and a knob in the player's color, offset by (dx, dy) within the travel. */
export function drawJoystick(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: ColorToken,
  alpha = 1,
): void {
  if (alpha <= 0) return;
  g.fillStyle(theme.color.surfaceStrong.num, 0.9 * alpha);
  g.fillCircle(x, y, PHONE.stickRadius);
  g.lineStyle(edge, theme.color.borderControl.num, alpha);
  g.strokeCircle(x, y, PHONE.stickRadius);
  const len = Math.hypot(dx, dy);
  const k = len > PHONE.knobTravel ? PHONE.knobTravel / len : 1;
  const kx = x + dx * k;
  const ky = y + dy * k;
  g.fillStyle(color.num, alpha);
  g.fillCircle(kx, ky, PHONE.knobRadius);
  g.lineStyle(edge, theme.color.stickerOutline.num, alpha);
  g.strokeCircle(kx, ky, PHONE.knobRadius);
}

/** The yolk-colored SLAM button; pressed drops its shadow and nudges it, like the CSS. */
export function drawSlamButton(g: Phaser.GameObjects.Graphics, pressed: boolean): void {
  const { x, y, r } = PHONE.slam;
  const sh = theme.shadow.sticker;
  const o = pressed ? 4 : 0;
  if (!pressed) {
    g.fillStyle(sh.color.num, 1);
    g.fillCircle(x + sh.x, y + sh.y, r);
  }
  g.fillStyle(theme.color.yolk.num, 1);
  g.fillCircle(x + o, y + o, r);
  g.lineStyle(edge, theme.color.stickerOutline.num, 1);
  g.strokeCircle(x + o, y + o, r);
}

/** The "SLAM" label on the button (static; follows the pressed nudge via `nudge`). */
export function addSlamLabel(scene: Phaser.Scene): Phaser.GameObjects.Text {
  const t = theme.type.pad;
  return scene.add
    .text(PHONE.slam.x, PHONE.slam.y, 'SLAM', {
      fontFamily: t.family,
      fontSize: '17px',
      color: theme.color.accentOn.hex,
    })
    .setOrigin(0.5);
}

/** Charge arc around the button: a clockwise wedge from the top in the player's color, plus a flash. */
export function drawChargeArc(
  g: Phaser.GameObjects.Graphics,
  color: ColorToken,
  charge: number,
  flash: number,
): void {
  const { x, y, r } = PHONE.slam;
  const R = r * 1.3;
  if (charge > 0) {
    g.lineStyle(7, color.num, 1);
    g.beginPath();
    g.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, charge), false);
    g.strokePath();
  }
  if (flash > 0) {
    g.lineStyle(7 + 6 * flash, theme.color.yolkShine.num, flash);
    g.strokeCircle(x, y, R + 4 * (1 - flash));
  }
}

/** A thumb: a rounded finger reaching in from the lower left to a fingertip at (x, y). */
export function drawThumb(g: Phaser.GameObjects.Graphics, x: number, y: number, alpha = 1): void {
  if (alpha <= 0) return;
  const w = 30;
  const bx = x - 80;
  const by = y + 90;
  g.lineStyle(w + edge * 2, theme.color.stickerOutline.num, alpha);
  g.lineBetween(bx, by, x, y);
  g.fillStyle(theme.color.stickerOutline.num, alpha);
  g.fillCircle(x, y, w / 2 + edge);
  g.lineStyle(w, theme.players.rose.fill.num, alpha);
  g.lineBetween(bx, by, x, y);
  g.fillStyle(theme.players.rose.fill.num, alpha);
  g.fillCircle(x, y, w / 2);
  // Nail.
  g.fillStyle(theme.color.cream.num, alpha);
  g.fillCircle(x - 1, y - 3, 7);
}
