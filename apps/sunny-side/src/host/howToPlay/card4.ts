// How to play card 4 illustration, "The pan is heating up" (SPEC §6.9, §6.2): the rim pulses its heat
// warning, then the safe radius shrinks and the heat ring pushes the eggs toward the middle.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import { drawArena, heatPulse, RIM_WIDTH } from '../render/arena';
import { drawEgg } from '../render/egg';
import { addBigPanLayer, alongFromCenter, EGG_R, PAN_CX, PAN_CY, PAN_R } from './panScene';
import { clamp01, easeInOutQuad, phase, track } from './timeline';
import type { IllustrationScript } from './types';

const WARN_START = 500;
const SHRINK_START = 2100;
const SHRINK_END = 3900;
const MIN_R = 195;
const EGGS = [
  { id: 'a', color: theme.players.crimson.fill, ang: -2.2, dist: 240 },
  { id: 'b', color: theme.players.cobalt.fill, ang: 0.4, dist: 262 },
  { id: 'c', color: theme.players.jade.fill, ang: 2.2, dist: 248 },
] as const;

/** Safe radius at loop time `t`: full until the shrink starts, then easing down (never grows). */
export const shrinkRadius = track([
  [SHRINK_START, PAN_R],
  [SHRINK_END, MIN_R, easeInOutQuad],
]);

export const card4Script: IllustrationScript = {
  id: 'shrink',
  loopMs: 5400,
  stillMs: 3200,
  create(scene: Phaser.Scene) {
    const { bg, g } = addBigPanLayer(scene);
    return {
      draw(t) {
        g.clear();
        const radius = shrinkRadius(t);
        const shrinking = t >= SHRINK_START && t < SHRINK_END;
        drawArena(g, PAN_CX, PAN_CY, { radius, startRadius: PAN_R, shrinking }, t, false);
        // Before the shrink only the rim pulses the heat warning (the arena draws heat once the
        // radius has dropped).
        const warn = phase(t, WARN_START, SHRINK_START);
        if (warn > 0 && warn < 1) {
          const p = heatPulse(t * 1.6);
          g.lineStyle(RIM_WIDTH, theme.color.heat.num, clamp01(0.35 + 0.65 * p));
          g.strokeCircle(PAN_CX, PAN_CY, PAN_R + RIM_WIDTH / 2);
        }
        for (const e of EGGS) {
          const home = {
            x: PAN_CX + Math.cos(e.ang) * e.dist,
            y: PAN_CY + Math.sin(e.ang) * e.dist,
          };
          // The heat pushes an egg inward just enough to stay inside the safe edge.
          const p = alongFromCenter(home, Math.min(e.dist, radius - EGG_R - 12));
          drawEgg(g, {
            x: p.x,
            y: p.y,
            radius: EGG_R,
            id: e.id,
            color: e.color,
            charge: 0,
            jiggle: 0,
            angle: 0,
          });
        }
      },
      destroy() {
        bg.destroy();
        g.destroy();
      },
    };
  },
};
