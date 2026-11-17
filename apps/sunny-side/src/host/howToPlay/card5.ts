// How to play card 5 illustration, "Scoring" (SPEC §6.9, §6.4): egg A bumps egg B off the pan and
// "+1" pops over A, then A is alone and "+3" pops. Eggs and text use the real renderers and tokens.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import { drawArena } from '../render/arena';
import { drawEgg, jiggleAt } from '../render/egg';
import { addText } from '../scenes/ui';
import {
  addBigPanLayer,
  alongFromCenter,
  boxPoint,
  EGG_R,
  mix,
  PAN_CX,
  PAN_CY,
  PAN_R,
  type Vec,
} from './panScene';
import { backOut, easeInCubic, easeOutCubic, phase, track } from './timeline';
import type { IllustrationScript } from './types';

const HIT_AT = 1100;
const B_HOME: Vec = { x: PAN_CX + 105, y: PAN_CY - 45 };
const B_OUT = alongFromCenter(B_HOME, PAN_R + EGG_R + 135);
const A_HOME: Vec = { x: PAN_CX - 180, y: PAN_CY + 90 };
const A_HIT: Vec = { x: PAN_CX + 15, y: PAN_CY - 8 };
const POP1 = [1300, 2400] as const;
const POP3 = [3000, 4300] as const;

/** A score label's pop at loop time `t`: scale (overshoots), alpha and rise in px; all 0 outside it. */
export function popAt(
  t: number,
  start: number,
  end: number,
): { scale: number; alpha: number; rise: number } {
  const p = phase(t, start, end);
  if (p <= 0 || p >= 1) return { scale: 0, alpha: 0, rise: 0 };
  return {
    scale: backOut(phase(t, start, start + 260)),
    alpha: 1 - phase(t, start + (end - start) * 0.7, end),
    rise: 36 * easeOutCubic(p),
  };
}

/** Which score label shows at `t`: "+1", "+3" or null. */
export function scoreLabelAt(t: number): '+1' | '+3' | null {
  if (popAt(t, POP1[0], POP1[1]).alpha > 0) return '+1';
  if (popAt(t, POP3[0], POP3[1]).alpha > 0) return '+3';
  return null;
}

const aPos = track([
  [0, A_HOME],
  [700, A_HOME],
  [HIT_AT, A_HIT, easeInCubic],
  [1500, { x: A_HIT.x - 30, y: A_HIT.y + 12 }, easeOutCubic],
]);

export const card5Script: IllustrationScript = {
  id: 'scoring',
  loopMs: 5200,
  stillMs: 3400,
  create(scene: Phaser.Scene) {
    const { bg, g } = addBigPanLayer(scene);
    const label = addText(scene, 0, 0, '+1', 'banner', theme.color.yolk)
      .setOrigin(0.5)
      .setStroke(theme.color.stickerOutline.hex, 10)
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
        const a = aPos(t);
        const b = mix(B_HOME, B_OUT, easeOutCubic(phase(t, HIT_AT, 2100)));
        const gone = phase(t, 1700, 2100);
        if (gone < 1) {
          drawEgg(g, {
            x: b.x,
            y: b.y,
            radius: EGG_R * (1 - 0.4 * gone),
            id: 'b',
            color: theme.players.cobalt.fill,
            charge: 0,
            jiggle: jiggleAt(t - HIT_AT, 0.9),
            angle: 0,
            alpha: 1 - gone,
          });
        }
        drawEgg(g, {
          x: a.x,
          y: a.y,
          radius: EGG_R,
          id: 'a',
          color: theme.players.crimson.fill,
          charge: 0,
          jiggle: jiggleAt(t - HIT_AT, 0.5),
          angle: 0,
        });
        const which = scoreLabelAt(t);
        label.setVisible(which !== null);
        if (which) {
          const pop = which === '+1' ? popAt(t, POP1[0], POP1[1]) : popAt(t, POP3[0], POP3[1]);
          label.setText(which);
          const at = boxPoint(a);
          label.setPosition(at.x, at.y - EGG_R * 0.66 - 44 - pop.rise);
          label.setScale(pop.scale * (which === '+3' ? 1.3 : 1));
          label.setAlpha(pop.alpha);
        }
      },
      destroy() {
        bg.destroy();
        g.destroy();
        label.destroy();
      },
    };
  },
};
