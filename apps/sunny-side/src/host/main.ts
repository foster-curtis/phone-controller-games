// Host (TV) entry: boots an empty Phaser 4 scene. M6 replaces the scene list.
import * as Phaser from 'phaser';
import { loadBrandFonts } from '../shared/fonts';
import { theme } from '../shared/theme';
import '../styles/brand.css';

class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }
}

await loadBrandFonts();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1920,
  height: 1080,
  backgroundColor: theme.color.background.hex,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene],
});
