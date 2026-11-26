// Sheets over the play screen (SPEC §6.6, §6.13, §6.17): merchant dialog, pawnbroker, sell-to-NPC, pack
// and the tip-off screen. They sit on the right so the joystick stays live; only the tip-off covers it.
// Each builder returns a `.pane`; the play view rebuilds a sheet when its slice of state changes.
// Never imports host code.
import type { Ctx } from '../ctx';
import { MERCHANT_FACE_URL } from '../art';
import type { TipViewer } from '../tipViewer';
import { btn, el, itemIcon, money, prettyName, secs, setText, weightBar } from '../ui';

export type DialogMode = 'main' | 'buy' | 'ask';

const pane = (name: string, ...kids: (Node | null)[]) =>
  el('section', { class: `pane sheet ${name}`, 'data-sheet': name }, ...kids);

const row = (...kids: (Node | null)[]) => el('div', { class: 'row' }, ...kids);

export function dialogSheet(
  ctx: Ctx,
  mode: DialogMode,
  setMode: (m: DialogMode) => void,
): HTMLElement {
  const d = ctx.state.dialog!;
  const body = el('div', { class: 'dialog-body' });
  if (mode === 'main') {
    body.append(
      btn('Just browsing', 'quiet', () => ctx.send({ t: 'dialog', pick: 'browsing' }), {
        'data-pick': 'browsing',
      }),
      btn('Buy…', 'quiet', () => setMode('buy'), { 'data-pick': 'buy' }),
      btn('Ask about…', 'quiet', () => setMode('ask'), { 'data-pick': 'ask' }),
      btn('Leave', 'quiet far', () => ctx.send({ t: 'dialog', pick: 'leave' }), {
        'data-pick': 'leave',
      }),
    );
  } else if (mode === 'buy') {
    for (const r of d.buy)
      body.append(
        row(
          itemIcon(r.item),
          el('span', { class: 'label grow', text: r.name }),
          el('b', { class: 'money', text: money(r.price) }),
          btn('Buy', 'primary coin-edge', () => ctx.send({ t: 'buy', item: r.item }), {
            'data-item': r.item,
          }),
        ),
      );
    body.append(btn('Back', 'quiet', () => setMode('main')));
  } else {
    for (const r of d.ask)
      body.append(
        row(
          itemIcon(r.item),
          el('span', { class: 'label grow', text: r.name }),
          btn(
            'Ask',
            'primary coin-edge',
            () => ctx.send({ t: 'dialog', pick: 'ask', slot: r.slot }),
            {
              'data-slot': String(r.slot),
            },
          ),
        ),
      );
    if (d.ask.length === 0)
      body.append(el('p', { class: 'caption', text: 'Nothing on the back shelf.' }));
    body.append(btn('Back', 'quiet', () => setMode('main')));
  }
  return pane(
    'dialog',
    el('img', { class: 'face', src: MERCHANT_FACE_URL, alt: '', draggable: 'false' }),
    el('div', { class: 'dialog-main' }, el('h2', { class: 'h2', text: "WHAT'LL IT BE?" }), body),
  );
}

export function sellSheet(ctx: Ctx, close: () => void): HTMLElement {
  const { sell, pack } = ctx.state;
  const sheet = sell!;
  const offers = new Map(sheet.offers.map((o) => [o.item, o.price]));
  const wants = sheet.wants.map((id) => pack.find((p) => p.item === id)?.name ?? prettyName(id));
  const rows = pack.map((p) => {
    const offer = offers.get(p.item);
    const r = row(
      itemIcon(p.item),
      el('span', { class: 'label grow', text: p.name }),
      el('b', { class: 'money', text: offer === undefined ? money(p.value) : money(offer) }),
      btn('Sell', 'primary coin-edge', () => ctx.send({ t: 'sell', item: p.item, to: sheet.to }), {
        'data-item': p.item,
      }),
    );
    r.classList.add(offer === undefined ? 'grey' : 'match');
    if (offer === undefined) r.querySelector('button')!.disabled = true;
    return r;
  });
  return pane(
    'sell',
    el('h2', { class: 'h2', text: 'SELL' }),
    el('p', { class: 'caption', text: `Wants: ${wants.join(', ') || 'nothing'}` }),
    el('div', { class: 'list' }, ...rows),
    btn('Close', 'quiet', close),
  );
}

export interface PawnSheetEl {
  el: HTMLElement;
  tick(now: number): void;
}

export function pawnSheet(ctx: Ctx, close: () => void): PawnSheetEl {
  const p = ctx.state.pawn!;
  const offers = new Map(p.sheet.offers.map((o) => [o.item, o.price]));
  const timer = el('p', { class: 'caption rate' });
  const rows = ctx.state.pack.map((it) => {
    const offer = offers.get(it.item);
    const r = row(
      itemIcon(it.item),
      el('span', { class: 'label grow', text: it.name }),
      el('b', { class: 'money', text: offer === undefined ? '—' : money(offer) }),
      btn('Sell', 'primary coin-edge', () => ctx.send({ t: 'sell', item: it.item, to: 'pawn' }), {
        'data-item': it.item,
      }),
    );
    if (offer === undefined) {
      r.classList.add('grey');
      r.querySelector('button')!.disabled = true;
    }
    return r;
  });
  const root = pane(
    'pawn',
    el('h2', { class: 'h2', text: 'PAWNBROKER' }),
    weightBar(ctx.state.weight, ctx.state.cap),
    timer,
    el('div', { class: 'list' }, ...rows),
    btn('Close', 'quiet', close),
  );
  const tick = (now: number) => setText(timer, `Today's rates change in ${secs(p.until - now)}s`);
  tick(ctx.now());
  return { el: root, tick };
}

export function packSheet(ctx: Ctx, close: () => void): HTMLElement {
  const { pack, weight, cap } = ctx.state;
  return pane(
    'pack',
    el('h2', { class: 'h2', text: 'YOUR PACK' }),
    weightBar(weight, cap),
    el(
      'div',
      { class: 'list' },
      ...(pack.length
        ? pack.map((i) =>
            row(
              itemIcon(i.item),
              el('span', { class: 'label grow', text: i.name }),
              el('b', { class: 'money', text: money(i.value) }),
            ),
          )
        : [el('p', { class: 'caption', text: 'Your pack is empty.' })]),
    ),
    btn('Close', 'quiet', close),
  );
}

export interface TipScreen {
  el: HTMLElement;
  viewer: TipViewer;
  tick(now: number): void;
  destroy(): void;
}

/** The tip-off screen (SPEC §6.13, §6.17): snapshot viewer, fee, SEND GUARD, Cancel. */
export function tipScreen(ctx: Ctx, onCancel: () => void): TipScreen {
  const tip = ctx.state.tip!;
  let target: number | null = null;
  let sent = false;
  const send = btn(
    'SEND GUARD',
    'primary coin-edge',
    () => {
      if (target === null || sent) return;
      sent = true;
      send.disabled = true;
      ctx.send({ t: 'tipSend', target });
    },
    { 'data-action': 'tipSend' },
  );
  send.disabled = true;
  const timer = el('span', { class: 'caption rate' });
  const viewer = ctx.tipViewer({
    snapshot: tip.snapshot,
    hits: tip.hits,
    onSelect: (t) => {
      target = t;
      send.disabled = t === null || sent;
    },
  });
  const root = el(
    'section',
    { class: 'pane tip', 'data-sheet': 'tip' },
    el('div', { class: 'tip-view' }, viewer.el),
    el(
      'div',
      { class: 'tip-side' },
      el('h2', { class: 'h2', text: 'TIP OFF' }),
      el('p', { class: 'body', text: 'Tap the thief.' }),
      el('p', { class: 'fee money', text: `Fee ${money(tip.fee)}` }),
      timer,
      send,
      btn('Cancel', 'quiet', onCancel, { 'data-action': 'tipCancel' }),
    ),
  );
  const tick = (now: number) => setText(timer, `${secs(tip.until - now)}s left`);
  tick(ctx.now());
  return { el: root, viewer, tick, destroy: () => viewer.destroy() };
}
