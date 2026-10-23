// Eliminated: "Respawn as a ghost in" + a very large countdown (SPEC §6.7).
import { el } from '../dom';
import type { Screen } from '../../shared/messages';
import { standingsList, type ScreenView } from './common';

type Eliminated = Extract<Screen, { kind: 'eliminated' }>;

export function createEliminated(first: Eliminated): ScreenView<Eliminated> {
  const root = el('section', { class: 'screen eliminated', 'data-screen': 'eliminated' });
  const num = el('div', { class: 'title count', 'aria-live': 'polite' });
  const list = el('div', { class: 'elim-standings' });
  root.append(
    el(
      'div',
      { class: 'elim-main' },
      el('h1', { class: 'h2 sticker-heading', text: 'Respawn as a ghost in' }),
      num,
    ),
    list,
  );
  let shown = '';
  const apply = (s: Eliminated) => {
    const n = String(Math.max(1, Math.ceil(s.respawnMs / 1000)));
    if (n !== shown) {
      shown = n;
      num.textContent = n;
      // Restart the pulse animation on each change.
      num.classList.remove('pulse');
      void num.offsetWidth;
      num.classList.add('pulse');
    }
    list.replaceChildren(standingsList(s));
  };
  apply(first);
  return { el: root, update: apply, destroy() {} };
}
