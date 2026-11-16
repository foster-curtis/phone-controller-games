// How to play card 6 illustration, "Come back as a ghost" (SPEC §6.9, §6.2): an egg falls off and a
// 4..1 countdown ticks; then a steam ghost floats in, shows its wind-up ring and puffs an egg over
// the rim. Ghost and puff come from render/ghost; no sim code.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import { drawArena } from '../render/arena';
import { drawEgg } from '../render/egg';
import { drawGhost, drawPuff, PUFF_MS } from '../render/ghost';
import { addText } from '../scenes/ui';
import { alongFromCenter, EGG_R, mix, PAN_CX, PAN_CY, PAN_R, type Vec } from './panScene';
import { countdownDigit, easeInOutQuad, easeOutCubic, easeOutQuad, phase } from './timeline';
import type { IllustrationScript } from './types';

const FALL_END = 700;
const COUNT_START = 700;
const COUNT_STEP = 600;
const FLOAT_START = 3000;
const FLOAT_END = 3800;
const WINDUP_END = 4200;
const PUFF_END = WINDUP_END + PUFF_MS;
const PUSH_END = 5000;
/** Where the first egg left the pan, and where its countdown and then the ghost appear. */
const EXIT: Vec = { x: 110, y: PAN_CY };
const FALL_FROM: Vec = { x: 250, y: PAN_CY + 30 };
const GHOST_AT: Vec = { x: PAN_CX - 20, y: PAN_CY + 30 };
const TARGET_HOME: Vec = { x: PAN_CX + 60, y: PAN_CY - 70 };
const TARGET_OUT = alongFromCenter(TARGET_HOME, PAN_R + EGG_R + 110);

/** The countdown digit shown at loop time `t` (4, 3, 2, 1) or null. */
export const countdownAt = (t: number): number | null =>
  countdownDigit(t, COUNT_START, COUNT_STEP, 4);

export const card6Script: IllustrationScript = {
  id: 'ghost',
  loopMs: 5800,
  stillMs: 4300,
  create(scene: Phaser.Scene) {
    const g = scene.add.graphics();
    const digit = addText(scene, EXIT.x, EXIT.y, '4', 'title', theme.color.yolk)
      .setOrigin(0.5)
      .setStroke(theme.color.stickerOutline.hex, 12)
      .setVisible(false);
    return {
      draw(t) {
        g.clear();
        drawArena(
          g,
          PAN_CX,
          PAN_CY,
          { radius: PAN_R, startRadius: PAN_R, shrinking: false },
          t,
          false,
        );

        // The knocked-off egg slides over the rim and fades.
        const fall = phase(t, 0, FALL_END);
        if (fall < 1) {
          const p = mix(FALL_FROM, EXIT, easeInOutQuad(fall));
          drawEgg(g, {
            x: p.x,
            y: p.y,
            radius: EGG_R * (1 - 0.35 * fall),
            id: 'f',
            color: theme.players.berry.fill,
            charge: 0,
            jiggle: 0,
            angle: 0,
            alpha: 1 - fall,
          });
        }

        const n = countdownAt(t);
        digit.setVisible(n !== null);
        if (n !== null) digit.setText(String(n));

        // The egg the ghost is about to push, riding the puff over the rim.
        const push = phase(t, WINDUP_END, PUSH_END);
        const out = phase(t, PUSH_END - 300, PUSH_END);
        if (out < 1) {
          const p = mix(TARGET_HOME, TARGET_OUT, easeOutQuad(push));
          drawEgg(g, {
            x: p.x,
            y: p.y,
            radius: EGG_R,
            id: 't',
            color: theme.players.jade.fill,
            charge: 0,
            jiggle: 0,
            angle: 0,
            alpha: 1 - out,
          });
        }

        if (t >= FLOAT_START) {
          const arrive = easeOutCubic(phase(t, FLOAT_START, FLOAT_END));
          const pos = mix(EXIT, GHOST_AT, arrive);
          const windup = phase(t, FLOAT_END, WINDUP_END);
          const fired = t >= WINDUP_END;
          drawGhost(g, {
            x: pos.x,
            y: pos.y,
            color: theme.players.berry.fill,
            windup: fired ? 0 : windup,
            cooldown: fired ? phase(t, WINDUP_END, WINDUP_END + 1500) : 0,
            now: t,
          });
          if (fired && t < PUFF_END) {
            drawPuff(g, { x: pos.x, y: pos.y, start: WINDUP_END, t: (t - WINDUP_END) / PUFF_MS });
          }
        }
      },
      destroy() {
        g.destroy();
        digit.destroy();
      },
    };
  },
};
