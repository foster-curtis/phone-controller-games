// Round (countdown + playing): draws the interpolated sim snapshot each frame. Basic M6 rendering:
// pan + rim, eggs as egg-white circles with an outline, a yolk and a player-color ring, ghosts,
// names over eggs, countdown, round number and a text scoreboard. (M7 replaces the look.)
import * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import type { PlayerView } from '../match';
import {
  HEIGHT,
  SAFE,
  SCENE,
  WIDTH,
  addText,
  createRefresher,
  drawStandings,
  hostContext,
  playerColor,
} from './ui';

const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const RIM = 14;
const RING = 6;

export class RoundScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private names = new Map<string, Phaser.GameObjects.Text>();
  private countdown!: Phaser.GameObjects.Text;
  private roundLabel!: Phaser.GameObjects.Text;
  private board: Phaser.GameObjects.GameObject[] = [];
  private refresh = createRefresher();

  constructor() {
    super(SCENE.round);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(theme.color.background.hex);
    this.refresh = createRefresher();
    this.g = this.add.graphics();
    this.names = new Map();
    this.board = [];
    this.roundLabel = addText(this, SAFE, SAFE, '', 'h2');
    this.countdown = addText(this, CX, CY, '', 'title', theme.color.accentText)
      .setOrigin(0.5)
      .setDepth(10);
  }

  override update(time: number): void {
    const { runtime } = hostContext(this);
    const view = runtime.view();
    const byId = new Map<string, PlayerView>(view.players.map((p) => [p.id, p]));

    if (this.refresh(runtime, time)) {
      this.roundLabel.setText(`Round ${view.round} · first to ${view.targetScore}`);
      for (const o of this.board) o.destroy();
      this.board = drawStandings(this, WIDTH - SAFE - 400, SAFE, view.players, {
        style: 'tag',
        rowHeight: 36,
        scoreX: 400,
      });
    }
    this.countdown.setText(
      view.phase === 'countdown' ? String(Math.max(1, Math.ceil(view.countdownMs / 1000))) : '',
    );

    const snap = runtime.snapshot();
    const g = this.g.clear();

    // Pan + rim.
    g.fillStyle(theme.color.pan.num, 1);
    g.fillCircle(CX, CY, snap.arena.radius);
    g.lineStyle(RIM, theme.color.panRim.num, 1);
    g.strokeCircle(CX, CY, snap.arena.radius + RIM / 2);

    // Ghosts (under eggs): translucent steam with a player-color edge.
    for (const ghost of snap.ghosts) {
      const color = playerColor(byId.get(ghost.id)?.color ?? null);
      const r = 28;
      g.fillStyle(theme.translucent.steam.num, theme.translucent.steam.alpha * 0.5);
      g.fillCircle(CX + ghost.x, CY + ghost.y, r);
      g.lineStyle(RING, color.num, 0.6 + 0.4 * ghost.windup);
      g.strokeCircle(CX + ghost.x, CY + ghost.y, r + ghost.windup * 12);
    }

    const seen = new Set<string>();
    for (const egg of snap.eggs) {
      const x = CX + egg.x;
      const y = CY + egg.y;
      const p = byId.get(egg.id);
      g.lineStyle(RING, playerColor(p?.color ?? null).num, 1);
      g.strokeCircle(x, y, egg.radius + RING);
      g.fillStyle(theme.color.eggWhite.num, 1);
      g.fillCircle(x, y, egg.radius);
      g.lineStyle(theme.stroke.sticker, theme.color.eggOutline.num, 1);
      g.strokeCircle(x, y, egg.radius);
      g.fillStyle(theme.color.yolk.num, 1);
      g.fillCircle(x, y, egg.radius * 0.45);

      seen.add(egg.id);
      let label = this.names.get(egg.id);
      if (!label) {
        label = addText(this, 0, 0, '', 'tag').setOrigin(0.5, 1).setDepth(5);
        this.names.set(egg.id, label);
      }
      label.setText(p?.name ?? '').setPosition(x, y - egg.radius - RING - theme.space[2]);
    }
    for (const [id, label] of this.names) {
      if (!seen.has(id)) {
        label.destroy();
        this.names.delete(id);
      }
    }
  }
}
