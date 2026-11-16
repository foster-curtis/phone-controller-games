// How to play card 4 illustration (SPEC §6.9). H0 placeholder (a label only); H3b replaces it.
import type * as Phaser from 'phaser';
import { ILLUSTRATION_H, ILLUSTRATION_W, type IllustrationScript } from './types';

export const card4Script: IllustrationScript = {
  id: 'shrink',
  loopMs: 4000,
  stillMs: 0,
  create(scene: Phaser.Scene) {
    const label = scene.add.text(ILLUSTRATION_W / 2, ILLUSTRATION_H / 2, 'shrink').setOrigin(0.5);
    return {
      draw() {},
      destroy: () => label.destroy(),
    };
  },
};
