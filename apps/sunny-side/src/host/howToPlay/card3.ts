// How to play card 3 illustration (SPEC §6.9): the thumb holds SLAM and the charge arc grows; on the
// TV the egg squashes, its slam ring fills and flashes at max charge. On release it launches into a
// second egg, which flies off the pan. Real egg, slam ring and arena renderers.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import { drawArena, drawCounter } from '../render/arena';
import { drawEgg, jiggleAt } from '../render/egg';
import { HEIGHT, WIDTH } from '../render/layout';
import { SLAM_FLASH_MS, drawSlamRing } from '../render/slamRing';
import { PAN_ARENA, PAN_CENTER, PAN_EGG_RADIUS, PAN_SCALE, drawTvPane, fall } from './panArt';
import {
  PHONE,
  addSlamLabel,
  drawChargeArc,
  drawPhone,
  drawSlamButton,
  drawThumb,
} from './phoneArt';
import { easeInQuad, easeOutQuad, phase, track } from './timeline';
import type { IllustrationScript } from './types';

const SLAMMER = theme.players.crimson.fill;
const VICTIM = theme.players.cobalt.fill;
const PRESS = 400;
const MAX = 2400;
const RELEASE = 2900;
const HIT = 3150;

const charge = (t: number) => (t >= RELEASE ? 0 : phase(t, PRESS, MAX));
const flash = (t: number) => (t >= MAX && t < RELEASE ? 1 - phase(t, MAX, MAX + SLAM_FLASH_MS) : 0);
const slammer = track([
  [0, { x: -70, y: 20 }],
  [RELEASE, { x: -70, y: 20 }],
  [HIT, { x: -15, y: 20 }, easeInQuad],
  [3600, { x: 12, y: 16 }, easeOutQuad],
]);
const victim = track([
  [0, { x: 60, y: 20 }],
  [HIT, { x: 60, y: 20 }],
  [3900, { x: 260, y: -50 }, easeOutQuad],
]);
/** The thumb slides onto SLAM, presses, and lifts off at release. */
const thumb = track([
  [0, { x: PHONE.slam.x + 60, y: PHONE.slam.y + 50 }],
  [PRESS, { x: PHONE.slam.x, y: PHONE.slam.y }, easeOutQuad],
  [RELEASE, { x: PHONE.slam.x, y: PHONE.slam.y }],
  [RELEASE + 350, { x: PHONE.slam.x + 20, y: PHONE.slam.y + 30 }, easeOutQuad],
]);

export const card3Script: IllustrationScript = {
  id: 'slam',
  loopMs: 5600,
  // Full charge: egg squashed, ring full and flashing, arc full.
  stillMs: 2500,
  create(scene: Phaser.Scene) {
    const bg = scene.add.graphics().setScale(0.5);
    drawCounter(bg, WIDTH / 2, HEIGHT / 2, 1);
    const ui = scene.add.graphics();
    const pan = scene.add.graphics().setPosition(PAN_CENTER.x, PAN_CENTER.y).setScale(PAN_SCALE);
    const label = addSlamLabel(scene);
    return {
      draw(t: number) {
        ui.clear();
        pan.clear();
        const c = charge(t);
        const f = flash(t);
        drawTvPane(ui);
        drawPhone(ui);
        const pressed = t >= PRESS && t < RELEASE;
        drawSlamButton(ui, pressed);
        label.setPosition(PHONE.slam.x + (pressed ? 4 : 0), PHONE.slam.y + (pressed ? 4 : 0));
        drawChargeArc(ui, SLAMMER, c, f);
        const th = thumb(t);
        drawThumb(ui, th.x, th.y, 1 - phase(t, RELEASE + 150, RELEASE + 450));

        drawArena(pan, 0, 0, PAN_ARENA, 0, false);
        const a = slammer(t);
        const b = victim(t);
        const drop = fall(t, 3450);
        drawEgg(pan, {
          x: b.x,
          y: b.y + drop.dy,
          radius: PAN_EGG_RADIUS * drop.scale,
          id: 'victim',
          color: VICTIM,
          charge: 0,
          jiggle: jiggleAt(t - HIT, 0.9),
          angle: 0,
          alpha: drop.alpha,
        });
        drawEgg(pan, {
          x: a.x,
          y: a.y,
          radius: PAN_EGG_RADIUS,
          id: 'slammer',
          color: SLAMMER,
          charge: c,
          jiggle: jiggleAt(t - HIT, 0.5),
          angle: 0,
        });
        drawSlamRing(pan, a.x, a.y, PAN_EGG_RADIUS + 18, SLAMMER, c, f);
      },
      destroy() {
        bg.destroy();
        ui.destroy();
        pan.destroy();
        label.destroy();
      },
    };
  },
};
