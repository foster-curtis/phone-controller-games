// How to play card 1 illustration (SPEC §6.9): four eggs bump around the skillet and get shoved off
// the rim one by one; the last egg left gets a small crown. Drawn at game scale (1920x1080) in a
// graphics scaled by 0.5, so the real arena and egg renderers look exactly like the game.
import type * as Phaser from 'phaser';
import { theme, type ColorToken } from '../../shared/theme';
import { drawArena } from '../render/arena';
import { drawEgg, jiggleAt } from '../render/egg';
import type { SimSnapshot } from '../sim/types';
import { BIG_PAN, addBigPanLayer, drawCrown, fall } from './panArt';
import { easeInOutQuad, easeOutCubic, easeOutQuad, phase, track, type Point } from './timeline';
import type { IllustrationScript } from './types';

const PAN_R = BIG_PAN.r;
const EGG_R = BIG_PAN.eggR;
const ARENA: SimSnapshot['arena'] = { radius: PAN_R, startRadius: PAN_R, shrinking: false };

interface Egg {
  id: string;
  color: ColorToken;
  path: (t: number) => Point;
  /** When it starts dropping away; null for the winner. */
  fallAt: number | null;
  /** Bumps [timeMs, strength 0..1] that make it jiggle. */
  hits: [number, number][];
}

const p = (x: number, y: number): Point => ({ x, y });

const EGGS: Egg[] = [
  {
    id: 'crimson',
    color: theme.players.crimson.fill,
    path: track([
      [0, p(-200, -130)],
      [900, p(-110, -60), easeInOutQuad],
      [1300, p(-50, -20), easeOutQuad],
      [1900, p(-85, 15), easeInOutQuad],
      [2500, p(-20, 50), easeInOutQuad],
      [3100, p(60, 10), easeInOutQuad],
      [3800, p(0, 0), easeInOutQuad],
    ]),
    fallAt: null,
    hits: [
      [1300, 0.6],
      [1900, 0.6],
      [3100, 0.7],
    ],
  },
  {
    id: 'cobalt',
    color: theme.players.cobalt.fill,
    path: track([
      [0, p(200, -140)],
      [900, p(130, -90), easeInOutQuad],
      [1300, p(40, -30), easeOutQuad],
      [2200, p(330, -170), easeOutCubic],
      [2900, p(450, -230)],
    ]),
    fallAt: 2100,
    hits: [[1300, 0.9]],
  },
  {
    id: 'jade',
    color: theme.players.jade.fill,
    path: track([
      [0, p(-200, 150)],
      [1000, p(-130, 80), easeInOutQuad],
      [1900, p(-60, 60), easeOutQuad],
      [2700, p(-250, 230), easeOutCubic],
      [3300, p(-310, 280)],
    ]),
    fallAt: 2600,
    hits: [[1900, 0.9]],
  },
  {
    id: 'berry',
    color: theme.players.berry.fill,
    path: track([
      [0, p(200, 150)],
      [1200, p(110, 70), easeInOutQuad],
      [3100, p(90, 50), easeInOutQuad],
      [3900, p(260, 260), easeOutCubic],
      [4300, p(310, 300)],
    ]),
    fallAt: 3600,
    hits: [[3100, 0.9]],
  },
];

export const card1Script: IllustrationScript = {
  id: 'pan',
  loopMs: 5800,
  // Everyone else is off the pan and the last egg wears the crown.
  stillMs: 4500,
  create(scene: Phaser.Scene) {
    // Game coordinates around (0, 0), shown at the shared big-pan scale in the 960x540 box.
    const { bg, g } = addBigPanLayer(scene);
    return {
      draw(t: number) {
        g.clear();
        drawArena(g, 0, 0, ARENA, 0, false);
        for (const egg of EGGS) {
          const pos = egg.path(t);
          const f = egg.fallAt === null ? { dy: 0, scale: 1, alpha: 1 } : fall(t, egg.fallAt);
          let jiggle = 0;
          for (const [at, amp] of egg.hits) jiggle += jiggleAt(t - at, amp);
          drawEgg(g, {
            x: pos.x,
            y: pos.y + f.dy,
            radius: EGG_R * f.scale,
            id: egg.id,
            color: egg.color,
            charge: 0,
            jiggle,
            angle: 0,
            alpha: f.alpha,
          });
        }
        const win = EGGS[0]!.path(t);
        drawCrown(g, win.x, win.y - EGG_R * 1.1, phase(t, 3900, 4300), 1.6);
      },
      destroy() {
        bg.destroy();
        g.destroy();
      },
    };
  },
};
