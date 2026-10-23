// In-round HUD (SPEC §6.6): round label panel, scoreboard panel, shrink-warning sticker.
// Positions come from layout.ts (all inside the TV-safe rect).
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import type { MatchView } from '../match';
import { addText, sortedStandings } from '../scenes/ui';
import { hudLayout } from './layout';
import { drawPanel, drawPill, drawSticker } from './sticker';

/** Rebuilds the round label and scoreboard; returns the objects to destroy on the next rebuild. */
export function drawHud(scene: Phaser.Scene, view: MatchView): Phaser.GameObjects.GameObject[] {
  const players = sortedStandings(view.players.filter((p) => p.color));
  const layout = hudLayout(players.length);
  const g = scene.add.graphics().setDepth(4);
  const made: Phaser.GameObjects.GameObject[] = [g];

  drawPanel(g, layout.roundLabel);
  made.push(
    addText(
      scene,
      layout.roundLabel.x + theme.space[4],
      layout.roundLabel.y + layout.roundLabel.h / 2,
      `Round ${view.round}  ·  first to ${view.targetScore}`,
      'pad',
    )
      .setOrigin(0, 0.5)
      .setDepth(4),
  );

  if (players.length === 0) return made;
  drawPanel(g, layout.scoreboard.panel);
  players.forEach((p, i) => {
    const cells = layout.scoreboard.rows[i]!;
    const token = theme.players[p.color!];
    const dim = p.left || !p.connected;
    const alpha = dim ? 0.45 : 1;
    drawPill(g, cells.pill, dim ? theme.color.presenceOff.num : token.fill.num, {
      shadow: 'none',
      alpha,
    });
    made.push(
      addText(
        scene,
        cells.pill.x + cells.pill.w / 2,
        cells.pill.y + cells.pill.h / 2,
        p.name,
        'tag',
        dim ? theme.color.foreground : token.on,
      )
        .setOrigin(0.5)
        .setAlpha(alpha)
        .setDepth(4),
      addText(
        scene,
        cells.score.x + cells.score.w,
        cells.score.y + cells.score.h / 2,
        String(p.score),
        'score',
        theme.color.accentText,
      )
        .setOrigin(1, 0.5)
        .setAlpha(alpha)
        .setDepth(4),
    );
  });
  return made;
}

/** The heat sticker shown while the pan shrinks; toggle with `setVisible`. */
export function createShrinkWarning(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const r = hudLayout(0).shrinkWarning;
  const g = scene.add.graphics();
  drawSticker(g, { x: -r.w / 2, y: -r.h / 2, w: r.w, h: r.h }, theme.color.heat.num, {
    radius: theme.radius.pill,
  });
  const text = addText(scene, 0, 0, 'The pan is heating up!', 'pad', theme.color.heatOn).setOrigin(
    0.5,
  );
  return scene.add
    .container(r.x + r.w / 2 - theme.shadow.sticker.x, r.y + r.h / 2 - theme.shadow.sticker.y, [
      g,
      text,
    ])
    .setDepth(6)
    .setVisible(false);
}
