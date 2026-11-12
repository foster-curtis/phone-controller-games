// Match winner (SPEC §6.6 Screens): "Winner!" banner, the winner's sticker, the final round's
// points breakdown, host Rematch / Back to lobby, and the feedback QR (PLATFORM decision #11).
import * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import { drawBreakdown } from '../render/breakdown';
import { FEEDBACK_CAPTION, FEEDBACK_SUBCAPTION, feedbackQr } from '../render/feedback';
import { screenLayout, winnerLayout } from '../render/layout';
import { drawQr, qrFit } from '../render/qr';
import { drawPanel, drawPill } from '../render/sticker';
import {
  SAFE,
  SCENE,
  WIDTH,
  addButton,
  addText,
  canStart,
  createRefresher,
  hostContext,
  installRemoveClicks,
  playerColor,
  playerOn,
  sceneRemoveControls,
  type HostButton,
} from './ui';

export class WinnerScene extends Phaser.Scene {
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private rematch!: HostButton;
  private lobby!: HostButton;
  private refresh = createRefresher();

  constructor() {
    super(SCENE.winner);
  }

  create(): void {
    const { runtime } = hostContext(this);
    this.cameras.main.setBackgroundColor(theme.color.background.hex);
    this.refresh = createRefresher();
    this.dynamic = [];
    hostContext(this).removeButtons = [];
    installRemoveClicks(this, () => {
      this.refresh = createRefresher();
    });
    this.rematch = addButton(this, WIDTH - SAFE, SAFE, 'Rematch', () =>
      runtime.match.hostAction('rematch'),
    );
    this.lobby = addButton(
      this,
      WIDTH - SAFE - this.rematch.width - theme.space[6],
      SAFE,
      'Back to lobby',
      () => runtime.match.hostAction('lobby'),
      'plain',
    );
    this.drawFeedback();
  }

  /** Static: drawn once per visit, outside the refresh, so it never holds up the buttons. */
  private drawFeedback(): void {
    const L = winnerLayout();
    const qr = feedbackQr();
    const { cell, box } = qrFit(qr, L.qrMax.w);
    const g = this.add.graphics();
    drawPanel(g, L.feedback);
    drawQr(g, qr, L.qrMax.x + (L.qrMax.w - box) / 2, L.qrMax.y + L.qrMax.h - box, cell);
    const cx = L.caption.x + L.caption.w / 2;
    const head = addText(this, cx, L.caption.y, FEEDBACK_CAPTION, 'h2', theme.color.foreground)
      .setOrigin(0.5, 0)
      .setAlign('center')
      .setWordWrapWidth(L.caption.w);
    addText(
      this,
      cx,
      head.y + head.height + theme.space[3],
      FEEDBACK_SUBCAPTION,
      'pad',
      theme.color.muted,
    )
      .setOrigin(0.5, 0)
      .setAlign('center')
      .setWordWrapWidth(L.caption.w);
  }

  private removeControls() {
    return sceneRemoveControls(this, () => {
      this.refresh = createRefresher();
    });
  }

  override update(time: number): void {
    const ctx = hostContext(this);
    const { runtime } = ctx;
    if (!this.refresh(runtime, time)) return;
    for (const o of this.dynamic) o.destroy();
    ctx.removeButtons = [];
    const view = runtime.view();
    const winner = view.players.find((p) => p.id === view.winnerId);
    const { header } = screenLayout();
    const content = winnerLayout().breakdown;
    const lineY = header.y + header.h + theme.space[3];

    const banner = addText(this, header.x, header.y, 'Winner!', 'banner', theme.color.accentText);
    this.dynamic = [banner];
    if (winner) {
      const label = addText(this, 0, 0, winner.name, 'score', playerOn(winner.color)).setOrigin(
        0.5,
      );
      const w = label.width + theme.space[8] * 2;
      const rect = { x: banner.x + banner.width + theme.space[6], y: header.y + 6, w, h: 68 };
      const g = this.add.graphics();
      drawPill(g, rect, playerColor(winner.color).num);
      label.setPosition(rect.x + rect.w / 2, rect.y + rect.h / 2).setDepth(1);
      this.dynamic.push(g, label);
    }
    this.dynamic.push(
      addText(
        this,
        header.x,
        lineY,
        `After ${view.round} rounds  ·  final round`,
        'h2',
        theme.color.muted,
      ),
      ...drawBreakdown(this, content, view.breakdown, view.players, this.removeControls()),
    );
    this.rematch.setEnabled(canStart(view) && !view.paused);
    this.lobby.setEnabled(!view.paused);
  }
}
