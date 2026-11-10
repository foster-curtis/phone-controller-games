// Phone emoji bar (SPEC §6.6 emoji bullet, §7.3 `emoji`): five reactions, shown when the screen's
// `canEmoji` is set (review and results for everyone but the photographer, and spectators).
import { el } from '@pcg/controller-kit';
import { EMOJI, type EmojiIndex, type Screen } from '../../shared/messages';
import type { Ctx } from '../ctx';

export function emojiBar(s: Screen, ctx: Ctx): HTMLElement | null {
  if (!s.canEmoji) return null;
  return el(
    'div',
    { class: 'emoji-bar', role: 'group', 'aria-label': 'React' },
    ...EMOJI.map((glyph, i) => {
      const b = el('button', {
        type: 'button',
        class: 'emoji-btn',
        'data-emoji': String(i),
        'aria-label': `React ${glyph}`,
        text: glyph,
        style: 'font-size:2rem;min-width:56px;min-height:56px;background:none;border:0;',
      });
      b.addEventListener('click', () => ctx.send({ t: 'emoji', i: i as EmojiIndex }));
      return b;
    }),
  );
}
