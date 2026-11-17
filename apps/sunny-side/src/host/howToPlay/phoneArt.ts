// The phone controller drawn small for cards 2 and 3 (SPEC §6.9), in the controller's brand style:
// a landscape phone, the floating joystick, the SLAM button with its charge arc, and a thumb.
// Theme tokens only. Coordinates are illustration-box pixels.
import type * as Phaser from 'phaser';
import { theme, type ColorToken } from '../../shared/theme';

/** The phone's body and where its controls sit. */
export const PHONE = {
  x: 30,
  y: 185,
  w: 400,
  h: 220,
  /** Where the floating stick appears under the thumb (left half). */
  stick: { x: 130, y: 295 },
  stickRadius: 54,
  knobRadius: 22,
  /** Farthest the knob moves from the base center. */
  knobTravel: 30,
  slam: { x: 345, y: 295, r: 40 },
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
      fontSize: '22px',
      color: theme.color.accentOn.hex,
    })
    .setOrigin(0.5);
}

/**
 * Charge arc around the button: a dim track, then a clockwise wedge from the top in the player's
 * color (ink-outlined so it reads on the dark screen), plus a bright flash at max charge.
 */
export function drawChargeArc(
  g: Phaser.GameObjects.Graphics,
  color: ColorToken,
  charge: number,
  flash: number,
): void {
  const { x, y, r } = PHONE.slam;
  const R = r + 16;
  g.lineStyle(10, theme.color.borderControl.num, 0.5);
  g.strokeCircle(x, y, R);
  if (charge > 0) {
    const end = -Math.PI / 2 + Math.PI * 2 * Math.min(1, charge);
    g.lineStyle(16, theme.color.stickerOutline.num, 1);
    g.beginPath();
    g.arc(x, y, R, -Math.PI / 2, end, false);
    g.strokePath();
    g.lineStyle(10, color.num, 1);
    g.beginPath();
    g.arc(x, y, R, -Math.PI / 2, end, false);
    g.strokePath();
  }
  if (flash > 0) {
    g.lineStyle(10 + 8 * flash, theme.color.yolkShine.num, flash);
    g.strokeCircle(x, y, R + 4 * (1 - flash));
  }
}

/** Which side the thumb reaches in from (the left stick's thumb from the left, SLAM's from the right). */
export type ThumbSide = 'left' | 'right';

const THUMB_W = 74;

/** Unit vector from a fingertip back along the thumb toward the player's hand (below the phone). */
function thumbDir(side: ThumbSide): { x: number; y: number } {
  const x = side === 'left' ? -0.3 : 0.3;
  const len = Math.hypot(x, 1);
  return { x: x / len, y: 1 / len };
}

/** Closed polygon of an ellipse at (x, y) turned by `rot`, for the nail. */
function ellipsePoints(x: number, y: number, rx: number, ry: number, rot: number) {
  const pts: { x: number; y: number }[] = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const px = Math.cos(a) * rx;
    const py = Math.sin(a) * ry;
    pts.push({ x: x + px * c - py * s, y: y + px * s + py * c });
  }
  return pts as unknown as Phaser.Math.Vector2[];
}

/**
 * A thumb pressing the screen at (x, y): a cream, sticker-outlined finger coming up from below the
 * phone with a rounded tip and a nail. The pad sits `reach` px back along the finger so the control
 * under it (the stick knob, the button's face) still shows above the fingertip.
 */
export function drawThumb(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  alpha = 1,
  side: ThumbSide = 'left',
  reach = 56,
): void {
  if (alpha <= 0) return;
  const d = thumbDir(side);
  const tx = x + d.x * reach;
  const ty = y + d.y * reach;
  const bx = tx + d.x * 200;
  const by = ty + d.y * 200;
  const r = THUMB_W / 2;
  const ink = theme.color.stickerOutline.num;
  // Outline pass, then the fill: a capsule from the hand to a round fingertip.
  g.lineStyle(THUMB_W + edge * 2, ink, alpha);
  g.lineBetween(bx, by, tx, ty);
  g.fillStyle(ink, alpha);
  g.fillCircle(tx, ty, r + edge);
  g.lineStyle(THUMB_W, theme.color.cream.num, alpha);
  g.lineBetween(bx, by, tx, ty);
  g.fillStyle(theme.color.cream.num, alpha);
  g.fillCircle(tx, ty, r);
  // Nail near the tip, turned along the finger.
  const rot = Math.atan2(d.y, d.x) + Math.PI / 2;
  const nail = ellipsePoints(tx - d.x * 6, ty - d.y * 6 - 3, 21, 26, rot);
  g.fillStyle(theme.color.brandPaper.num, alpha);
  g.fillPoints(nail, true, true);
  g.lineStyle(3, ink, alpha);
  g.strokePoints(nail, true, true);
}
