// How to play card 2 illustration (SPEC §6.9): split frame. Left, a phone with a thumb dragging the
// floating joystick; right, the egg on a small pan slides the same way and drifts a little after the
// thumb lifts. Real egg and arena renderers; the phone is drawn by phoneArt.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import { drawArena } from '../render/arena';
import { drawEgg } from '../render/egg';
import {
  PAN_ARENA,
  PAN_CENTER,
  PAN_EGG_RADIUS,
  PAN_SCALE,
  addBackdrop,
  drawTvPane,
} from './panArt';
import { PHONE, drawJoystick, drawPhone, drawThumb } from './phoneArt';
import { easeInOutQuad, easeOutCubic, easeOutQuad, phase, track } from './timeline';
import type { IllustrationScript } from './types';

const COLOR = theme.players.cobalt.fill;
const TOUCH = PHONE.stick;
const THUMB_DOWN = 500;
const THUMB_UP = 3000;

/** The stick's knob offset from its base while the thumb is down (right, then down-left). */
const knob = track([
  [800, { x: 0, y: 0 }],
  [1700, { x: 30, y: -9 }, easeInOutQuad],
  [2500, { x: -15, y: 21 }, easeInOutQuad],
  [3000, { x: -15, y: 21 }],
]);
/** Egg center in pan units: follows the stick, then drifts a little after the thumb lifts. */
const egg = track([
  [0, { x: -55, y: 10 }],
  [800, { x: -55, y: 10 }],
  [1900, { x: 40, y: -25 }, easeInOutQuad],
  [2700, { x: 5, y: 35 }, easeInOutQuad],
  [3000, { x: -5, y: 46 }],
  [3900, { x: -20, y: 58 }, easeOutCubic],
]);

export const card2Script: IllustrationScript = {
  id: 'steer',
  loopMs: 5200,
  // Mid-drag: knob pushed, egg already sliding.
  stillMs: 1900,
  create(scene: Phaser.Scene) {
    const bg = addBackdrop(scene);
    const ui = scene.add.graphics();
    const pan = scene.add.graphics().setPosition(PAN_CENTER.x, PAN_CENTER.y).setScale(PAN_SCALE);
    return {
      draw(t: number) {
        ui.clear();
        pan.clear();
        drawTvPane(ui);
        drawPhone(ui);
        const k = knob(t);
        const land = easeOutQuad(phase(t, THUMB_DOWN - 250, THUMB_DOWN));
        if (t >= THUMB_DOWN && t < THUMB_UP) drawJoystick(ui, TOUCH.x, TOUCH.y, k.x, k.y, COLOR);
        if (t >= THUMB_DOWN - 250 && t < THUMB_UP + 400) {
          // Lands from below, follows the knob, then lifts away (down and fading) after release.
          const lift = Math.max(0, t - THUMB_UP) / 400;
          const away = 60 * (1 - land) + 40 * lift;
          drawThumb(
            ui,
            TOUCH.x + k.x,
            TOUCH.y + k.y + away,
            Math.min(land * 2, 1) * (1 - lift),
            'left',
          );
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
