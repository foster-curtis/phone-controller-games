// How to play overlay (SPEC §6.9): the kit's DOM card shell laid over the host canvas, with each
// card's illustration drawn on the canvas under the shell's slot (stage.ts). Used by the rules phase
// scene and the debug preview. Frozen at H0 (how-to-play): additive changes only.
import {
  createRulesShell,
  type RulesAction,
  type RulesCardContext,
  type RulesShellOptions,
} from '@pcg/game-kit';
import type * as Phaser from 'phaser';
import '../../styles/howToPlay.css';
import { rulesCards } from './cards';
import { createStage } from './stage';

export interface RulesOverlay {
  /** Shows a card (cheap to call every frame: the shell only re-mounts on a card change). */
  show(view: { card: number; cards: number }, ctx: RulesCardContext): void;
  readonly element: HTMLElement;
  /** Removes the shell, its listeners and every illustration scene. Idempotent. */
  destroy(): void;
}

export interface RulesOverlayOptions {
  /** Host keyboard / gamepad / on-card buttons. */
  onAction(action: RulesAction): void;
  /** Passed to the shell (tests). */
  shell?: Partial<Pick<RulesShellOptions, 'keys' | 'gamepad' | 'reducedMotion' | 'env'>>;
}

/** Mounts the overlay over `game.canvas` and keeps it on the canvas's on-screen rect. */
export function mountRulesOverlay(game: Phaser.Game, opts: RulesOverlayOptions): RulesOverlay {
  const stage = createStage(game);
  const shell = createRulesShell({
    cards: rulesCards(stage),
    onAction: opts.onAction,
    buttons: true,
    classes: { root: 'htp' },
    ...opts.shell,
  });
  const frame = document.createElement('div');
  frame.className = 'htp-frame';
  frame.append(shell.element);
  document.body.append(frame);

  const place = () => {
    const r = game.canvas.getBoundingClientRect();
    Object.assign(frame.style, {
      left: `${r.left + window.scrollX}px`,
      top: `${r.top + window.scrollY}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  };
  place();
  game.scale.on('resize', place);
  window.addEventListener('resize', place);

  let destroyed = false;
  return {
    element: frame,
    show: (view, ctx) => {
      if (!destroyed) shell.show(view, ctx);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      game.scale.off('resize', place);
      window.removeEventListener('resize', place);
      shell.destroy();
      stage.destroy();
      frame.remove();
    },
  };
}
