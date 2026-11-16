// How to play card 2 illustration (SPEC §6.9): split frame. Left, a phone with a thumb dragging the
// floating joystick; right, the egg on a small pan slides the same way and drifts a little after the
// thumb lifts. Real egg and arena renderers; the phone is drawn by phoneArt.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import { drawArena, drawCounter } from '../render/arena';
import { drawEgg } from '../render/egg';
import { HEIGHT, WIDTH } from '../render/layout';
import { PAN_ARENA, PAN_CENTER, PAN_EGG_RADIUS, PAN_SCALE, drawTvPane } from './panArt';
import { PHONE, drawJoystick, drawPhone, drawThumb } from './phoneArt';
import { easeInOutQuad, easeOutCubic, track } from './timeline';
import type { IllustrationScript } from './types';

const COLOR = theme.players.cobalt.fill;
const TOUCH = PHONE.stick;
const THUMB_DOWN = 450;
const THUMB_UP = 3000;

/** The stick's knob offset from its base while the thumb is down (right, then down-left). */
const knob = track([
  [600, { x: 0, y: 0 }],
  [1500, { x: 20, y: -6 }, easeInOutQuad],
  [2400, { x: -10, y: 14 }, easeInOutQuad],
  [3000, { x: -10, y: 14 }],
]);
/** Egg center in pan units: follows the stick, then drifts a little after the thumb lifts. */
const egg = track([
  [0, { x: -55, y: 10 }],
  [600, { x: -55, y: 10 }],
  [1700, { x: 45, y: -25 }, easeInOutQuad],
  [2600, { x: 5, y: 35 }, easeInOutQuad],
  [3000, { x: -8, y: 46 }],
  [3900, { x: -22, y: 56 }, easeOutCubic],
]);

export const card2Script: IllustrationScript = {
  id: 'steer',
  loopMs: 5200,
  // Mid-drag: knob pushed, egg already sliding.
  stillMs: 1700,
  create(scene: Phaser.Scene) {
    const bg = scene.add.graphics().setScale(0.5);
    drawCounter(bg, WIDTH / 2, HEIGHT / 2, 1);
    const ui = scene.add.graphics();
    const pan = scene.add.graphics().setPosition(PAN_CENTER.x, PAN_CENTER.y).setScale(PAN_SCALE);
    return {
      draw(t: number) {
        ui.clear();
        pan.clear();
        drawTvPane(ui);
        drawPhone(ui);
        const k = knob(t);
        if (t >= THUMB_DOWN && t < THUMB_UP) drawJoystick(ui, TOUCH.x, TOUCH.y, k.x, k.y, COLOR);
        if (t >= THUMB_DOWN && t < THUMB_UP + 400) {
          // Lifts away (up and fading) after release.
          const lift = Math.max(0, t - THUMB_UP) / 400;
          drawThumb(ui, TOUCH.x + k.x, TOUCH.y + k.y - 20 * lift, 1 - lift);
        }
        drawArena(pan, 0, 0, PAN_ARENA, 0, false);
        const e = egg(t);
        drawEgg(pan, {
          x: e.x,
          y: e.y,
          radius: PAN_EGG_RADIUS,
          id: 'steer',
          color: COLOR,
          charge: 0,
          jiggle: 0,
          angle: Math.atan2(k.y, k.x),
        });
      },
      destroy() {
        bg.destroy();
        ui.destroy();
        pan.destroy();
      },
    };
  },
};
