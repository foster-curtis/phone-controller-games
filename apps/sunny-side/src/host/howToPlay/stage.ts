// Illustration stage (SPEC §6.9, placement): one Phaser scene per mount on the existing host canvas,
// whose camera viewport follows the shell slot's on-screen rect; the shell's DOM sits over the canvas.
// Motion comes only from `rig.draw(t)` (no Phaser tweens or timers). The scene is a plain config
// object, so this file needs no runtime Phaser import.
import type * as Phaser from 'phaser';
import { WIDTH } from '../render/layout';
import { loopTime } from './timeline';
import {
  ILLUSTRATION_H,
  ILLUSTRATION_W,
  type IllustrationRig,
  type IllustrationScript,
  type IllustrationStage,
} from './types';

export interface SlotViewport {
  /** Camera viewport in game (canvas logical) pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Fits the illustration box inside the viewport (letterboxed). */
  zoom: number;
}

/**
 * Converts the slot's on-screen rect to a camera viewport. `k` = game px per CSS px of the canvas,
 * so a canvas scaled to any size still lines the camera up with the DOM slot.
 */
export function slotViewport(
  canvas: { left: number; top: number; width: number },
  slot: { left: number; top: number; width: number; height: number },
  gameWidth: number,
): SlotViewport {
  const k = canvas.width > 0 ? gameWidth / canvas.width : 1;
  const width = Math.max(1, slot.width * k);
  const height = Math.max(1, slot.height * k);
  return {
    x: (slot.left - canvas.left) * k,
    y: (slot.top - canvas.top) * k,
    width,
    height,
    zoom: Math.min(width / ILLUSTRATION_W, height / ILLUSTRATION_H),
  };
}

let nextKey = 0;

export function createStage(game: Phaser.Game): IllustrationStage {
  const live = new Set<{ destroy(): void }>();
  let stageDestroyed = false;

  return {
    mount(script: IllustrationScript, slot: HTMLElement, opts: { reducedMotion: boolean }) {
      if (stageDestroyed) return { destroy() {} };
      const key = `htp-illustration-${++nextKey}`;
      let scene: Phaser.Scene | null = null;
      let rig: IllustrationRig | null = null;
      let destroyed = false;
      let startTime: number | null = null;

      const place = () => {
        if (!scene) return;
        const v = slotViewport(
          game.canvas.getBoundingClientRect(),
          slot.getBoundingClientRect(),
          WIDTH,
        );
        const cam = scene.cameras.main;
        cam.setViewport(v.x, v.y, v.width, v.height);
        cam.setZoom(v.zoom);
        cam.centerOn(ILLUSTRATION_W / 2, ILLUSTRATION_H / 2);
      };

      const config = {
        create(this: Phaser.Scene) {
          if (destroyed) return;
          // Phaser calls this with the scene as `this`; `place` and `destroy` need it later.
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          scene = this;
          rig = script.create(this);
          place();
          // Transparent so the shell's DOM and the canvas behind show through.
          this.cameras.main.transparent = true;
          this.scene.bringToTop();
          if (opts.reducedMotion) rig.draw(script.stillMs);
          game.scale.on('resize', place);
        },
        // Reduced motion has no per-frame work at all.
        update: opts.reducedMotion
          ? undefined
          : (time: number) => {
              if (destroyed || !rig) return;
              startTime ??= time;
              place();
              rig.draw(loopTime(time - startTime, script.loopMs));
            },
      };

      const handle = {
        destroy() {
          if (destroyed) return;
          destroyed = true;
          live.delete(handle);
          game.scale.off('resize', place);
          rig?.destroy();
          rig = null;
          scene = null;
          game.scene.remove(key);
        },
      };
      live.add(handle);
      game.scene.add(key, config, true);
      game.scene.bringToTop(key);
      return handle;
    },
    destroy() {
      stageDestroyed = true;
      for (const h of [...live]) h.destroy();
    },
  };
}
