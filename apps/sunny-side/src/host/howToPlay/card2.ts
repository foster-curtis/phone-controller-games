// How to play card 2 illustration (SPEC §6.9). H0 placeholder (a label only); H3a replaces it.
import type * as Phaser from 'phaser';
import { ILLUSTRATION_H, ILLUSTRATION_W, type IllustrationScript } from './types';

export const card2Script: IllustrationScript = {
  id: 'steer',
  loopMs: 4000,
  stillMs: 0,
  create(scene: Phaser.Scene) {
    const label = scene.add.text(ILLUSTRATION_W / 2, ILLUSTRATION_H / 2, 'steer').setOrigin(0.5);
    return {
      draw() {},
      destroy: () => label.destroy(),
    };
  },
};
