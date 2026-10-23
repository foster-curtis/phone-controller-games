// Round results (SPEC §6.6 Screens): survivor line, text standings, and the host's Next round button.
import * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import {
  HEIGHT,
  SAFE,
  SCENE,
  WIDTH,
  addButton,
  addText,
  canStart,
  createRefresher,
  drawStandings,
  hostContext,
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
    this.next = addButton(this, WIDTH - SAFE - 200, HEIGHT - SAFE - 30, 'Next round', () =>
      runtime.match.hostAction('next'),
    );
  }

  override update(time: number): void {
    const { runtime } = hostContext(this);
    if (!this.refresh(runtime, time)) return;
    for (const o of this.dynamic) o.destroy();
    const view = runtime.view();
    const survivor = view.players.find((p) => p.id === view.survivorId);
    this.dynamic = [
      addText(this, SAFE, SAFE, `Round ${view.round} results`, 'banner'),
      addText(
        this,
        SAFE,
        SAFE + 96,
        survivor ? `${survivor.name} survived: +3` : 'No survivor this round',
        'h2',
        theme.color.accentText,
      ),
      addText(
        this,
        SAFE,
        SAFE + 152,
        `First to ${view.targetScore} wins`,
        'body',
        theme.color.muted,
      ),
      ...drawStandings(this, SAFE, SAFE + 220, view.players, { scoreX: 760 }),
    ];
    this.next.setEnabled(canStart(view) && !view.paused);
  }
}
