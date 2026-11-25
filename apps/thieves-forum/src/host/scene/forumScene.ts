// The TV canvas (SPEC §5): Phaser renders only, 1920 × 1080 logical, Scale.FIT. Setup shell: a
// placeholder forum in the brand colors (paving, two rows of five canopies, lanes) behind the lobby.
// The real market, rigs and art loading come with the build plan.
import * as Phaser from 'phaser';
import { theme } from '../../shared/theme';

export const CANVAS_W = 1920;
export const CANVAS_H = 1080;

/** SPEC §6.3 order: top row, then middle row. */
const CANOPIES = [
  ['pawnbroker', 'bakery', 'pottery', 'clothing', 'wine'],
  ['smithy', 'perfume', 'spices', 'rugs', 'jewelry'],
] as const;

class ForumScene extends Phaser.Scene {
  constructor() {
    super('forum');
  }

  create(): void {
    const c = theme.color;
    const g = this.add.graphics();
    g.fillStyle(c.forumGround.num, 1).fillRect(0, 0, CANVAS_W, CANVAS_H);
    g.lineStyle(2, c.paverLine.num, 0.6);
    for (let y = 60; y < CANVAS_H; y += 60) g.lineBetween(0, y, CANVAS_W, y);
    const stallW = 300;
    const gap = (CANVAS_W - stallW * 5) / 6;
    CANOPIES.forEach((row, r) => {
      const y = r === 0 ? 0 : 430;
      row.forEach((shop, i) => {
        const x = gap + i * (stallW + gap);
        g.fillStyle(c.woodDark.num, 1).fillRect(x, y + 40, stallW, 160);
        g.fillStyle(theme.canopy[shop].num, 1).fillRect(x - 10, y, stallW + 20, 70);
        g.lineStyle(4, c.brandInk.num, 1).strokeRect(x - 10, y, stallW + 20, 70);
      });
    });
    // Everything under the DOM lobby reads as a dim backdrop.
    const dim = theme.translucent.scrim;
    g.fillStyle(dim.num, dim.alpha).fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
}

export function createForumGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: theme.color.background.hex,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    banner: false,
    scene: [ForumScene],
  });
}
