// Round-flow phone screens (SPEC §6.14, §6.15, §6.17, §6.18): round start ("THIS IS YOU" with one or two
// outfit cards, SPEC §9 pairs prep), walk-on, Hands up!, stocks and match end. Timers arrive as
// `endsInMs` and run from receipt. Small and quiet: no full-screen flashes. Never imports host code.
import type { Screen } from '../../shared/messages';
import type { Ctx, View } from '../ctx';
import { outfitCard } from '../outfit';
import { btn, el, itemIcon, money, ordinal, secs, setText } from '../ui';

type Of<K extends Screen['s']> = Extract<Screen, { s: K }>;

export function roundStartView(ctx: Ctx, first: Of<'roundStart'>): View {
  const root = el('section', { class: 'screen round-start', 'data-screen': 'roundStart' });
  const count = el('p', { class: 'countdown money' });
  let until = 0;
  const render = (s: Of<'roundStart'>) => {
    until = ctx.now() + s.endsInMs;
    root.dataset.cards = String(s.outfits.length);
    root.replaceChildren(
      el('p', { class: 'caption', text: `Round ${s.round} of ${s.rounds}` }),
      el('h1', { class: 'banner', text: s.outfits.length > 1 ? 'THESE ARE YOU' : 'THIS IS YOU' }),
      el('div', { class: 'cards' }, ...s.outfits.map((o) => outfitCard(o))),
      count,
    );
    setText(count, String(secs(s.endsInMs)));
  };
  render(first);
  return {
    el: root,
    update: (s) => s.s === 'roundStart' && render(s),
    tick: (now) => setText(count, String(secs(until - now))),
    destroy: () => root.remove(),
  };
}

export function walkOnView(ctx: Ctx, first: Of<'walkOn'>): View {
  const root = el('section', { class: 'screen walk-on', 'data-screen': 'walkOn' });
  const line = el('h1', { class: 'banner' });
  let until = 0;
  let label = '';
  const render = (s: Of<'walkOn'>) => {
    until = ctx.now() + s.endsInMs;
    label = s.label;
    root.replaceChildren(outfitCard(s.outfit), el('div', { class: 'walk-text' }, line));
    tick(ctx.now());
  };
  const tick = (now: number) => {
    const over = now >= until;
    root.dataset.phase = over ? 'go' : 'wait';
    setText(line, over ? 'Your turn!' : `You're walking in at the ${label}`);
  };
  render(first);
  return {
    el: root,
    update: (s) => s.s === 'walkOn' && render(s),
    tick,
    destroy: () => root.remove(),
  };
}

const tile = (label: string, value: string, cls = '') =>
  el(
    'div',
    { class: `tile ${cls}`.trim() },
    el('span', { class: 'caption', text: label }),
    el('b', { class: 'money', text: value }),
  );

export function handsUpView(_ctx: Ctx, first: Of<'handsUp'>): View {
  const root = el('section', { class: 'screen hands-up', 'data-screen': 'handsUp' });
  const render = (s: Of<'handsUp'>) => {
    root.replaceChildren(
      el('h1', { class: 'banner amber', text: 'HANDS UP!' }),
      el(
        'div',
        { class: 'tiles' },
        tile('Bag', money(s.bag)),
        tile('Items', String(s.items.length)),
        tile('Total', money(s.total), 'total primary coin-edge'),
      ),
      el(
        'div',
        { class: 'chips' },
        ...s.items.map((i) =>
          el('span', { class: 'chip', title: i.name }, itemIcon(i.item, 'icon sm')),
        ),
      ),
    );
  };
  render(first);
  return { el: root, update: (s) => s.s === 'handsUp' && render(s), destroy: () => root.remove() };
}

export function stocksView(ctx: Ctx, first: Of<'stocks'>): View {
  const root = el('section', { class: 'screen stocks', 'data-screen': 'stocks' });
  const num = el('b', { class: 'ring-num money' });
  const ring = el('div', { class: 'ring', role: 'timer' }, num);
  let until = 0;
  let total = 1;
  const render = (s: Of<'stocks'>) => {
    until = ctx.now() + s.endsInMs;
    total = Math.max(total, s.endsInMs, 1);
    root.replaceChildren(
      el('h1', { class: 'banner danger', text: 'CAUGHT!' }),
      el('p', { class: 'body', text: `You lost ${money(s.pot)}` }),
      ring,
      el('p', { class: 'label', text: 'IN THE STOCKS' }),
    );
    tick(ctx.now());
  };
  const tick = (now: number) => {
    const left = Math.max(0, until - now);
    ring.style.setProperty('--left', String(Math.min(1, left / total)));
    setText(num, String(secs(left)));
  };
  render(first);
  return {
    el: root,
    update: (s) => s.s === 'stocks' && render(s),
    tick,
    destroy: () => root.remove(),
  };
}

export function matchEndView(ctx: Ctx, first: Of<'matchEnd'>): View {
  const root = el('section', { class: 'screen match-end', 'data-screen': 'matchEnd' });
  const render = (s: Of<'matchEnd'>) => {
    const place = `${s.tied ? 'Tied for ' : ''}${ordinal(s.place)}`;
    const feedback = el('a', {
      class: 'btn quiet',
      href: ctx.feedbackUrl,
      target: '_blank',
      rel: 'noopener',
      'data-action': 'feedback',
      text: 'Give feedback',
    });
    root.replaceChildren(
      el('p', { class: 'caption', text: 'Final place' }),
      el('h1', { class: 'banner amber', text: place }),
      tile('Total', money(s.total), 'total primary coin-edge'),
      el(
        'div',
        { class: 'leader-row' },
        feedback,
        s.leader
          ? btn(
              'Play again',
              'primary coin-edge',
              () => ctx.send({ t: 'leader', action: 'playAgain' }),
              {
                'data-action': 'playAgain',
              },
            )
          : null,
      ),
    );
  };
  render(first);
  return { el: root, update: (s) => s.s === 'matchEnd' && render(s), destroy: () => root.remove() };
}
