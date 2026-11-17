// Text-only screens (SPEC §6.7): rules, upload, spectating, left.
import { el, rulesPhoneModel } from '@pcg/controller-kit';
import type { RulesPhoneButton } from '@pcg/controller-kit';
import type { Ctx } from '../ctx';
import type { Screen } from '../../shared/messages';
import { emojiBar } from './emojiBar';
import { button, heading, para, renderedView, type View } from './view';

// The text and buttons come from the shared kit's model (PLATFORM #12); the builders are ours. Say
// Cheese shows "Watch the TV" to non-leaders only.
export function rulesView(first: Screen, ctx: Ctx): View {
  return renderedView('rules', first, (s) => {
    const m = rulesPhoneModel(s);
    const btn = (b: RulesPhoneButton) =>
      button(b.label, () => ctx.send({ t: 'leader', action: b.action }), {
        id: b.id,
        cls: b.quiet ? 'btn--quiet' : undefined,
      });
    return [
      heading(m.heading),
      para(m.caption, 'caption'),
      m.next
        ? el('div', { class: 'leader-row' }, btn(m.next), m.skip && btn(m.skip))
        : para(m.watch, 'body'),
    ];
  });
}

export function uploadView(first: Screen): View {
  return renderedView('upload', first, (s) => [
    heading(s.role === 'photographer' ? 'Sending photos…' : 'Developing…'),
    para(`${s.received} / ${s.expected}`, 'caption'),
    para('Watch the TV'),
  ]);
}

export function spectatingView(first: Screen, ctx: Ctx): View {
  return renderedView('spectating', first, (s) => [
    heading('Watch the TV'),
    para('The match is full. You are watching.', 'caption'),
    emojiBar(s, ctx),
  ]);
}

export function leftView(first: Screen): View {
  return renderedView('left', first, () => [
    heading('You left'),
    para('Close this page, or scan the TV again to rejoin.', 'caption'),
  ]);
}
