// Spectating: scores, round number, and the 5-emoji hotbar with a 1 s local cooldown (SPEC §6.7).
import { el } from '../dom';
import { EMOJI, type EmojiIndex, type Screen } from '../../shared/messages';
import { heading, roundLine, standingsList, type ScreenCtx, type ScreenView } from './common';

type Spectating = Extract<Screen, { kind: 'spectating' }>;

export const EMOJI_COOLDOWN_MS = 1000;

export function createSpectating(ctx: ScreenCtx, first: Spectating): ScreenView<Spectating> {
  const root = el('section', { class: 'screen spectating', 'data-screen': 'spectating' });
  const info = el('div', { class: 'spec-info scroll-y' });
  const bar = el('div', { class: 'hotbar' });
  root.append(el('div', { class: 'spec-main' }, heading('Watching'), info), bar);

  let readyAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const buttons = EMOJI.map((glyph, i) => {
    const b = el('button', {
      type: 'button',
      class: 'btn emoji-btn',
      'data-emoji': String(i),
      text: glyph,
    });
    b.addEventListener('click', () => {
      const now = Date.now();
      if (now < readyAt) return;
      readyAt = now + EMOJI_COOLDOWN_MS;
      ctx.send({ t: 'emoji', i: i as EmojiIndex });
      for (const x of buttons) x.disabled = true;
      timer = setTimeout(() => {
        for (const x of buttons) x.disabled = false;
      }, EMOJI_COOLDOWN_MS);
    });
    return b;
  });
  bar.append(...buttons);

  const apply = (s: Spectating) => info.replaceChildren(roundLine(s), standingsList(s));
  apply(first);
  return {
    el: root,
    update: apply,
    destroy() {
      if (timer !== null) clearTimeout(timer);
    },
  };
}
