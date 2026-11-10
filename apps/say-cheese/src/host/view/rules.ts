// TV rules overview (SPEC §6.2.1, §6.6): one card per screen with an inline-SVG illustration (art.ts),
// progress dots, controls hint.
import type { TvView } from '../match/types';
import { ruleArt } from './art';
import { h } from './dom';

type Rules = Extract<TvView, { phase: 'rules' }>;

/** Draft copy from SPEC §6.2.1; card 3 may say "no hiding behind couches" (dodging, not camping). */
export const RULE_CARDS: { icon: string; title: string; text: string }[] = [
  {
    icon: '📸',
    title: 'Say cheese!',
    text: 'One player is the photographer. Eyes closed, they spin around and snap photos for 20 seconds. Everyone else: stay out of the shot!',
  },
  {
    icon: '🏃',
    title: 'Keep moving.',
    text: 'The photographer can turn any way, any time. When the camera swings toward you, duck, dive, or slip behind another player. Other people make the best cover!',
  },
  {
    icon: '📜',
    title: 'House rules.',
    text: 'Stay in the room and out in the open: no hiding behind couches, doors, or furniture. Camping in one spot ruins the fun; the scramble is the game. Photographer: no peeking! And watch out for each other.',
  },
  {
    icon: '🎯',
    title: 'Busted!',
    text: 'After each round, everyone watches the photos on the TV. The photographer taps everyone they can spot (yes, an elbow counts). Each photo you are in: +1. Each catch: −1 for the photographer.',
  },
  {
    icon: '🏆',
    title: 'Lowest score wins.',
    text: 'Everyone gets one turn behind the camera. Fewest points at the end wins.',
  },
];

export function renderRules(v: Rules): HTMLElement {
  const el = h('section', 'view rules');
  const card = RULE_CARDS[Math.min(Math.max(v.card, 0), RULE_CARDS.length - 1)]!;
  el.dataset.card = String(v.card);
  el.append(ruleArt(v.card), h('h1', 'banner', card.title), h('p', 'rule-text', card.text));
  const dots = h('div', 'dots');
  for (let i = 0; i < v.cards; i++) dots.append(h('span', i === v.card ? 'dot on' : 'dot'));
  el.append(dots, h('p', 'caption hint', 'Leader: Next / Skip'));
  return el;
}
