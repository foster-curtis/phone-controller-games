// Boot: waits for the brand fonts (or their 3 s timeout) before any scene creates text, then hands
// over to the scene for the current match phase.
import * as Phaser from 'phaser';
import { loadBrandFonts } from '../../shared/fonts';
import { SCENE } from './ui';

export class BootScene extends Phaser.Scene {
  private readonly onReady: () => void;

  /** `onReady` runs once the fonts are settled; main.ts then shows the current phase's scene. */
  constructor(onReady: () => void) {
    super(SCENE.boot);
    this.onReady = onReady;
  }

  create(): void {
    void loadBrandFonts().then(() => this.onReady());
  }
}
