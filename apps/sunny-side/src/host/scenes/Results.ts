// Round results (SPEC §6.6 Screens): banner, survivor line, the per-player points breakdown
// (C2 note) and the host's Next round button. Without a breakdown it falls back to standings.
import * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import { drawBreakdown } from '../render/breakdown';
import { screenLayout } from '../render/layout';
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
  sceneRemoveControls,
  type HostButton,
} from './ui';

export class ResultsScene extends Phaser.Scene {
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private next!: HostButton;
  private refresh = createRefresher();

  constructor() {
    super(SCENE.results);
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
    this.next = addButton(this, WIDTH - SAFE, SAFE, 'Next round', () =>
      runtime.match.hostAction('next'),
    );
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
    const { header, content } = screenLayout();
    const survivor = view.players.find((p) => p.id === view.survivorId);
    const bonus = view.breakdown?.players
      .find((e) => e.playerId === view.survivorId)
      ?.items.find((i) => i.kind === 'survivor');
    const survivorLine = survivor
      ? `${survivor.name} survived${bonus ? `: +${bonus.points}` : ''}`
      : 'No survivor this round';
    const lineY = header.y + header.h + theme.space[3];
    this.dynamic = [
      addText(this, header.x, header.y, `Round ${view.round}`, 'banner'),
      addText(this, header.x, lineY, survivorLine, 'h2', theme.color.accentText),
      addText(
        this,
        header.x + header.w,
        lineY + theme.space[2],
        `First to ${view.targetScore} wins`,
        'body',
        theme.color.muted,
      ).setOrigin(1, 0),
      ...drawBreakdown(this, content, view.breakdown, view.players, this.removeControls()),
    ];
    this.next.setEnabled(canStart(view) && !view.paused);
  }
}
