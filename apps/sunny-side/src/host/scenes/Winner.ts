// Match winner (SPEC §6.6 Screens): winner line, final standings, host Rematch / Back to lobby.
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
    this.lobby = addButton(
      this,
      WIDTH - SAFE - 620,
      HEIGHT - SAFE - 30,
      'Back to lobby',
      () => runtime.match.hostAction('lobby'),
      'plain',
    );
    this.rematch = addButton(this, WIDTH - SAFE - 180, HEIGHT - SAFE - 30, 'Rematch', () =>
      runtime.match.hostAction('rematch'),
    );
  }

  override update(time: number): void {
    const { runtime } = hostContext(this);
    if (!this.refresh(runtime, time)) return;
    for (const o of this.dynamic) o.destroy();
    const view = runtime.view();
    const winner = view.players.find((p) => p.id === view.winnerId);
    this.dynamic = [
      addText(
        this,
        SAFE,
        SAFE,
        winner ? `${winner.name} wins!` : 'Match over',
        'title',
        theme.color.accentText,
      ),
      addText(this, SAFE, SAFE + 140, `After ${view.round} rounds`, 'body', theme.color.muted),
      ...drawStandings(this, SAFE, SAFE + 200, view.players, { scoreX: 760 }),
    ];
    this.rematch.setEnabled(canStart(view) && !view.paused);
    this.lobby.setEnabled(!view.paused);
  }
}
