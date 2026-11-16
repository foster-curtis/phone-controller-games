// Illustration stage (SPEC §6.9, placement): one Phaser scene on the existing host canvas whose
// camera viewport follows the shell slot's on-screen rect; the shell's DOM sits over the canvas.
// H0 stub: mounts draw nothing. H3a implements it.
import type * as Phaser from 'phaser';
import type { IllustrationStage } from './types';

export function createStage(_game: Phaser.Game): IllustrationStage {
  return {
    mount: () => ({ destroy() {} }),
    destroy() {},
  };
}
