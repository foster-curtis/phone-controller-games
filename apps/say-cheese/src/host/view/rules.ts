// TV rules overview (SPEC §6.2.1, §6.6): one card per screen with an inline-SVG illustration (art.ts),
// progress dots, controls hint. The card shell is the shared kit's (PLATFORM #12); the cards, copy and
// art are ours, styled onto the kit through tv.css.
import { createRulesShell } from '@pcg/game-kit';
import type { RulesCard, RulesShell } from '@pcg/game-kit';
import type { TvView } from '../match/types';
import { ruleArt } from './art';
import type { TvControls } from './dom';

type Rules = Extract<TvView, { phase: 'rules' }>;

/** Draft copy from SPEC §6.2.1; card 3 may say "no hiding behind couches" (dodging, not camping). */
export const RULE_CARDS: { title: string; text: string }[] = [
  {
    title: 'Say cheese!',
    text: 'One player is the photographer. Eyes closed, they spin around and snap photos for 20 seconds. Everyone else: stay out of the shot!',
  },
  {
    title: 'Keep moving.',
    text: 'The photographer can turn any way, any time. When the camera swings toward you, duck, dive, or slip behind another player. Other people make the best cover!',
  },
  {
    title: 'House rules.',
    text: 'Stay in the room and out in the open: no hiding behind couches, doors, or furniture. Camping in one spot ruins the fun; the scramble is the game. Photographer: no peeking! And watch out for each other.',
  },
  {
    title: 'Busted!',
    text: 'After each round, everyone watches the photos on the TV. The photographer taps everyone they can spot (yes, an elbow counts). Each photo you are in: +1. Each catch: −1 for the photographer.',
  },
  {
    title: 'Lowest score wins.',
    text: 'Everyone gets one turn behind the camera. Fewest points at the end wins.',
  },
];

const CARDS: RulesCard[] = RULE_CARDS.map((c, i) => ({
  title: c.title,
  body: c.text,
  illustration: {
    mount(slot) {
      const art = ruleArt(i);
      slot.append(art);
      return { destroy: () => art.remove() };
    },
  },
}));

// One shell per TV root and card: repaints of the same card reuse it (the art stays mounted); a new
// card or another phase destroys it (PLATFORM #12). A fresh shell per card keeps the per-card fade-in.
const shells = new WeakMap<HTMLElement, RulesShell>();

export function disposeRules(root: HTMLElement): void {
  shells.get(root)?.destroy();
  shells.delete(root);
}

export function renderRules(root: HTMLElement, v: Rules, controls: TvControls): HTMLElement {
  let shell = shells.get(root);
  if (shell && shell.card !== Math.min(Math.max(v.card, 0), CARDS.length - 1)) {
    disposeRules(root);
    shell = undefined;
  }
  if (!shell) {
    shell = createRulesShell({
      cards: CARDS,
      // The host keys live in controls.ts (one mapping for buttons and keys), so the shell has none.
      onAction: (action) => controls.emit({ action }),
      keys: false,
      gamepad: false,
      buttons: false,
      classes: {
        root: 'view rules',
        title: 'banner',
        body: 'rule-text',
        dots: 'dots',
        dot: 'dot',
        dotOn: 'on',
        hint: 'caption hint',
      },
    });
    shells.set(root, shell);
  }
  shell.show({ card: v.card, cards: v.cards }, { playerCount: 0 });
  return shell.element;
}
