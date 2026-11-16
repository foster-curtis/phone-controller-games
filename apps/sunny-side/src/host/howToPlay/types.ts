// How to play illustration contract (SPEC §6.9): each card's picture is a looping, timeline-scripted
// Phaser scene drawn with the real renderers (render/egg, ghost, slamRing, arena) on the host canvas.
// No physics and no `src/host/sim` imports. Frozen at H0 (how-to-play): additive changes only.
import type * as Phaser from 'phaser';

/** The illustration's world box; the stage's camera fits it into the shell's slot (letterboxed). */
export const ILLUSTRATION_W = 960;
export const ILLUSTRATION_H = 540;

/** One card's display objects, built once per mount. */
export interface IllustrationRig {
  /** Draws the loop at `tMs` (0 ≤ tMs < loopMs). Called every frame while animating, or once for a still. */
  draw(tMs: number): void;
  /** Destroys every object `create` made. The stage then removes its scene and listeners. */
  destroy(): void;
}

/** A card's scripted animation: a pure function of loop time, so it loops and tests cleanly. */
export interface IllustrationScript {
  /** For tests and the debug preview, e.g. `pan`, `steer`. */
  id: string;
  /** Full loop length including the pause at the end (about 3–5 s of motion, then a short hold). */
  loopMs: number;
  /** The representative frame drawn under reduced motion (no loop runs). */
  stillMs: number;
  /** Builds the objects in `scene`, inside the 0..ILLUSTRATION_W × 0..ILLUSTRATION_H box. */
  create(scene: Phaser.Scene): IllustrationRig;
}

/** Plays scripts on the host canvas in the region under a DOM slot. */
export interface IllustrationStage {
  /**
   * Starts `script` in the canvas region under `slot` (re-measured on resize) until the handle is
   * destroyed. Reduced motion draws `stillMs` once and starts no loop.
   */
  mount(
    script: IllustrationScript,
    slot: HTMLElement,
    opts: { reducedMotion: boolean },
  ): { destroy(): void };
  /** Tears down everything the stage added to the game (scenes, listeners). Idempotent. */
  destroy(): void;
}
