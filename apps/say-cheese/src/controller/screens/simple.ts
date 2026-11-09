// Text-only screens (SPEC §6.7): rules, upload, spectating, left.
import { el } from '@pcg/controller-kit';
import type { Ctx } from '../ctx';
import type { Screen } from '../../shared/messages';
import { button, heading, para, renderedView, type View } from './view';

export function rulesView(first: Screen, ctx: Ctx): View {
  return renderedView('rules', first, (s) => [
    heading('How to play'),
    para(`Card ${s.card + 1} of ${s.cards}`, 'caption'),
    s.isLeader
      ? el(
          'div',
          { class: 'leader-row' },
          button(
            s.card >= s.cards - 1 ? "Let's play!" : 'Next',
            () => ctx.send({ t: 'leader', action: 'next' }),
            { id: 'next' },
          ),
          s.card < s.cards - 1 &&
            button('Skip', () => ctx.send({ t: 'leader', action: 'skip' }), {
              id: 'skip',
              cls: 'btn--quiet',
            }),
        )
      : para('Watch the TV', 'body'),
  ]);
}

export function uploadView(first: Screen): View {
  return renderedView('upload', first, (s) => [
    heading(s.role === 'photographer' ? 'Sending photos…' : 'Developing…'),
    para(`${s.received} / ${s.expected}`, 'caption'),
    para('Watch the TV'),
  ]);
}

export function spectatingView(first: Screen): View {
  return renderedView('spectating', first, () => [
    heading('Watch the TV'),
    para('The match is full. You are watching.', 'caption'),
  ]);
}

export function leftView(first: Screen): View {
  return renderedView('left', first, () => [
    heading('You left'),
    para('Close this page, or scan the TV again to rejoin.', 'caption'),
  ]);
}
