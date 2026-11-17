// How to play on the phone (SPEC §6.9, §6.7): the kit's rules screen with Sunny Side's own builders.
// Everyone sees "Watch the TV" and the card count; the leader also gets Next / Skip, which send
// `{ t: 'leader', action }` (the host gates them by leader).
import { createRulesPhoneScreen, el, type RulesPhoneButton } from '@pcg/controller-kit';
import type { Screen } from '../../shared/messages';
import { heading, stickerButton, type ScreenCtx, type ScreenView } from './common';

type RulesScreen = Extract<Screen, { kind: 'rules' }>;

const state = (s: RulesScreen) => ({ card: s.card, cards: s.cards, isLeader: s.isLeader });

export function createRules(ctx: ScreenCtx, first: RulesScreen): ScreenView<RulesScreen> {
  const phone = createRulesPhoneScreen(state(first), {
    className: 'screen rules',
    onAction: (action) => ctx.send({ t: 'leader', action }),
    heading,
    text: (text, kind) => el('p', { class: kind === 'caption' ? 'caption muted' : 'body', text }),
    button: (b: RulesPhoneButton, onClick) => {
      const btn = stickerButton(b.label, onClick, b.quiet ? '' : 'btn-accent');
      btn.dataset.leader = b.action;
      return btn;
    },
  });
  return {
    el: phone.element,
    update: (s) => phone.update(state(s)),
    destroy: () => phone.destroy(),
  };
}
