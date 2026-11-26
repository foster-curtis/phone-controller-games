// Setup-side phone screens (SPEC §6.18, §6.19): lobby (name list, player color, Ready, leader How to
// play / Start), the shared How to play card screen, and the waiting screens. Never imports host code.
import { createRulesPhoneScreen } from '@pcg/controller-kit';
import { PLAYER_COLOR_IDS } from '../../shared/theme';
import type { Screen } from '../../shared/messages';
import type { Ctx, View } from '../ctx';
import { btn, el } from '../ui';

type Of<K extends Screen['s']> = Extract<Screen, { s: K }>;

export function lobbyView(ctx: Ctx, first: Of<'lobby'>): View {
  const root = el('section', { class: 'screen lobby', 'data-screen': 'lobby' });
  const render = (s: Of<'lobby'>) => {
    const me = s.players[s.you];
    const taken = new Set(s.players.filter((_, i) => i !== s.you).map((p) => p.color));
    const list = el('ul', { class: 'players' });
    s.players.forEach((p, i) => {
      list.append(
        el(
          'li',
          { class: `player${i === s.you ? ' you' : ''}${p.connected ? '' : ' away'}` },
          el('i', { class: 'dot', style: `background:var(--player-${p.color})` }),
          el('span', { class: 'label', text: p.name }),
          p.leader ? el('span', { class: 'tag', text: 'Leader' }) : null,
          el('span', { class: `tag ${p.ready ? 'ok' : ''}`, text: p.ready ? 'Ready' : '…' }),
        ),
      );
    });
    const swatches = el('div', { class: 'swatches', role: 'group', 'aria-label': 'Your color' });
    for (const c of PLAYER_COLOR_IDS) {
      const b = el('button', {
        type: 'button',
        class: 'swatch',
        'data-color': c,
        'aria-label': c,
        'aria-pressed': String(me?.color === c),
        style: `background:var(--player-${c})`,
      });
      b.disabled = taken.has(c);
      b.addEventListener('click', () => ctx.send({ t: 'color', color: c }));
      swatches.append(b);
    }
    const ready = btn(
      me?.ready ? 'Not ready' : 'Ready',
      me?.ready ? 'quiet' : 'primary coin-edge',
      () => ctx.send({ t: 'ready', ready: !me?.ready }),
      { 'data-action': 'ready' },
    );
    const right = el('div', { class: 'lobby-side' }, swatches, ready);
    if (me?.leader) {
      const start = btn(
        'Start',
        'primary coin-edge',
        () => ctx.send({ t: 'leader', action: 'start' }),
        {
          'data-action': 'start',
        },
      );
      start.disabled = !s.canStart;
      right.append(
        el(
          'div',
          { class: 'leader-row' },
          btn('How to play', 'quiet', () => ctx.send({ t: 'leader', action: 'howToPlay' }), {
            'data-action': 'howToPlay',
          }),
          start,
        ),
      );
    }
    root.replaceChildren(
      el(
        'div',
        { class: 'lobby-main' },
        el('div', { class: 'players-col' }, el('h1', { class: 'h2', text: 'Lobby' }), list),
        right,
      ),
    );
  };
  render(first);
  return {
    el: root,
    update: (s) => s.s === 'lobby' && render(s),
    destroy: () => root.remove(),
  };
}

export function rulesView(ctx: Ctx, s: Of<'rules'>): View {
  const toState = (r: Of<'rules'>) => ({ card: r.card, cards: r.count, isLeader: r.leader });
  const screen = createRulesPhoneScreen(toState(s), {
    onAction: (action) => ctx.send({ t: 'leader', action }),
    button: (b, onClick) =>
      btn(b.label, b.quiet ? 'quiet' : 'primary coin-edge', onClick, {
        id: b.id,
        'data-action': b.id,
      }),
    heading: (t) => el('h1', { class: 'h2', text: t }),
    text: (t, kind) => el('p', { class: kind, text: t }),
    className: 'screen rules',
  });
  return {
    el: screen.element,
    update: (r) => r.s === 'rules' && screen.update(toState(r)),
    destroy: () => screen.destroy(),
  };
}

const WAITING = {
  nextRound: {
    title: 'Next round',
    body: 'You will join at the start of the next round. Watch the TV.',
  },
  full: {
    title: 'Game is full',
    body: 'No room at this table. Try again when the next game starts.',
  },
} as const;

export function waitingView(_ctx: Ctx, first: Of<'waiting'>): View {
  const root = el('section', { class: 'screen waiting', 'data-screen': 'waiting' });
  const render = (s: Of<'waiting'>) => {
    root.dataset.reason = s.reason;
    root.replaceChildren(
      el('h1', { class: 'banner', text: WAITING[s.reason].title }),
      el('p', { class: 'body', text: WAITING[s.reason].body }),
    );
  };
  render(first);
  return { el: root, update: (s) => s.s === 'waiting' && render(s), destroy: () => root.remove() };
}
