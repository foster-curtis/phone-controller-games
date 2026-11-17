// Rules phase backdrop (SPEC §6.9): brand background only, no click targets underneath. The How to
// play overlay (kit card shell + illustration scene) mounts over the canvas while this scene runs.
import * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import { mountRulesOverlay, type RulesOverlay } from '../howToPlay/overlay';
import { SCENE, hostContext } from './ui';

export class RulesScene extends Phaser.Scene {
  private overlay: RulesOverlay | null = null;

  constructor() {
    super(SCENE.rules);
  }

  create(): void {
    const { runtime } = hostContext(this);
    this.cameras.main.setBackgroundColor(theme.color.background.hex);
    this.overlay = mountRulesOverlay(this.game, {
      onAction: (a) => runtime.match.hostAction(a),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.overlay?.destroy();
      this.overlay = null;
    });
  }

  override update(): void {
    const rules = hostContext(this).runtime.view().rules;
    if (!rules || !this.overlay) return;
    this.overlay.show({ card: rules.card, cards: rules.cards }, { playerCount: rules.playerCount });
  }
}
