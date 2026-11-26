// Build phase (SPEC §10.2, §10.3, §15.7): two phone screens in one view, then Ready.
//  1. Card pop-up: full screen, no stick: the class growth header, your three cards (tap selects, then
//     Confirm sends the one `card` intent), the phase timer. Selection is phone-local.
//  2. Shop (once `me.cards.picked` is set, or when no pop-up was dealt): the right 2/3 holds the team
//     coins' rows with price, hold-to-confirm and Request; the movement stick stays on the left third,
//     so players can reposition while shopping. No tabs, no builds (RD2 cut them).
// Ready is top right on both (a player may Ready before confirming; the pick is made at the deadline).
import { el, readSafeInsets } from '@pcg/controller-kit';
import type { CardId } from '../../shared/ids';
import type { MeGrowth, MeView, TeamView } from '../../shared/messages';
import { ShopRow, UpgradeCard, icon } from '../components';
import { layoutCombat } from '../layout';
import { mountStick } from './combat';
import {
  createCountdown,
  createKeyedList,
  createPauseControl,
  type ScreenCtx,
  type Snapshot,
  type View,
} from './common';

/** Names of the players who requested `item`, from the roster (falls back to the raw id). */
export function requesters(
  team: TeamView,
  item: string,
): { names: string[]; mine: (id: string | null, me: MeView) => boolean } {
  const by = team.wishlist.filter((w) => w.item === item).map((w) => w.by);
  const nameOf = (id: string) => team.roster.find((p) => p.playerId === id)?.name ?? id;
  return {
    names: by.map(nameOf),
    mine: (id, me) => by.some((b) => (id !== null && b === id) || nameOf(b) === me.name),
  };
}

const GROWTH_LABEL: Record<MeGrowth['stats'][number], string> = {
  maxHp: '+HP',
  damage: '+DMG',
  healing: '+HEAL',
};

/** The pop-up's header (§10.2): "Wave 4 cleared: +HP +DMG"; null before wave 1 (no growth yet). */
export function growthText(g: MeGrowth | null): string | null {
  if (!g) return null;
  const head = g.boss ? `Boss down, wave ${g.wave} cleared` : `Wave ${g.wave} cleared`;
  // Amounts in percent when the host sends them ("+3% HP"), else the bare label (RD4-fix-2).
  const part = (s: MeGrowth['stats'][number]): string => {
    const n = g.pct?.[s];
    return n === undefined ? GROWTH_LABEL[s] : `+${n}% ${GROWTH_LABEL[s].slice(1)}`;
  };
  return g.stats.length ? `${head}: ${g.stats.map(part).join(g.pct ? '  ' : ' ')}` : head;
}

/** The pop-up shows while a hand is dealt and no pick is made yet. */
export const showsPopup = (me: MeView): boolean =>
  me.cards.picked === null && me.cards.offer !== null && me.cards.offer.length > 0;

/** How long Confirm stays pressed after it sends, so a double tap sends one intent (ms). */
export const CONFIRM_LOCK_MS = 1500;

export function createBuild(ctx: ScreenCtx): View {
  const root = el('section', { class: 'screen build' });
  const phase = el('span', { class: 'phase-clock tag' });
  const clock = createCountdown(phase, (ms) => `BUILD PHASE · ${Math.ceil(ms / 1000)} S`, ctx.now);
  const stick = mountStick(root, ctx.sender);

  // ---- top bar: timer left; coins (shop only) and Ready right, left of the pause button ----
  const coinsEl = el('span', { class: 'coins score' });
  const coinBox = el('div', { class: 'coin-box' }, icon('coins', 'coin-glyph'), coinsEl);
  const ready = el('button', { type: 'button', class: 'btn btn-outline ready' });
  const topRow = el('div', { class: 'build-top' }, phase);
  const bar = el('div', { class: 'build-bar' }, coinBox, ready);

  // ---- card pop-up ----
  const growth = el('p', { class: 'growth tag' });
  const cardsHost = el('div', { class: 'cards' });
  const cards = createKeyedList(cardsHost);
  const confirm = el('button', {
    type: 'button',
    class: 'btn btn-primary confirm',
    'data-confirm': '',
    text: 'CONFIRM',
  });
  const popup = el(
    'div',
    { class: 'popup' },
    growth,
    el('p', { class: 'section-title tag', text: 'YOUR UPGRADE · PICK 1' }),
    cardsHost,
    el('div', { class: 'popup-footer' }, confirm),
  );

  // ---- shop ----
  const rowsHost = el('div', { class: 'shop-rows' });
  const rows = createKeyedList(rowsHost);
  const shop = el(
    'div',
    { class: 'build-panel shop-body' },
    el(
      'div',
      { class: 'shop-head' },
      el('p', { class: 'section-title tag', text: 'TEAM SHOP · ANYONE CAN BUY' }),
      el('p', { class: 'hint body', text: 'Hold big buys. Request adds to the TV wishlist.' }),
    ),
    rowsHost,
  );

  const pause = createPauseControl(ctx);
  let wasPaused = false;
  root.append(topRow, bar, popup, shop, pause.button, pause.layer);

  const place = () => {
    const l = layoutCombat(
      { width: root.clientWidth || innerWidth, height: root.clientHeight || innerHeight },
      readSafeInsets(),
    );
    stick.place(l.stick);
  };
  const onResize = () => place();
  window.addEventListener('resize', onResize);
  place();

  let last: Snapshot | null = null;
  let selected: CardId | null = null;
  let offerKey = '';
  let locked = false;
  let lockTimer: ReturnType<typeof setTimeout> | null = null;
  let wasPopup = false;
  // The hand Confirm was sent for: the phone moves on to the shop at once (SPEC §10.2), not on the host's ack.
  let confirmedKey: string | null = null;

  ready.addEventListener('click', () => last && ctx.intent({ k: 'ready', ready: !last.me.ready }));
  confirm.addEventListener('click', () => {
    if (!selected || locked) return;
    ctx.intent({ k: 'card', card: selected });
    confirmedKey = offerKey;
    // One intent per confirm; unlocks after a while in case the host refused it (the ack toasts).
    locked = true;
    confirm.disabled = true;
    lockTimer = setTimeout(() => {
      locked = false;
      if (last) render(last);
    }, CONFIRM_LOCK_MS);
    render(last!);
  });

  const renderCards = (offer: readonly CardId[]) => {
    cards.set(
      offer.map((id) => ({
        key: id,
        sig: `${id}|${selected === id}`,
        make: () => ({
          el: UpgradeCard(id, {
            state: selected === id ? 'selected' : 'offer',
            onSelect: () => {
              if (locked) return;
              selected = id;
              if (last) render(last);
            },
          }),
        }),
      })),
    );
  };

  const render = (s: Snapshot) => {
    last = s;
    const { me, team } = s;
    // Paused (FF14-fix-1): nothing held may carry over once the run resumes.
    const isPaused = pause.set(s);
    if (isPaused && !wasPaused) ctx.sender.neutral();
    wasPaused = isPaused;
    clock.set(team.buildEndsInMs);
    ready.replaceChildren(
      icon('ready', 'ready-glyph'),
      el('span', { text: me.ready ? 'READY ✓' : 'READY' }),
    );
    ready.classList.toggle('on', me.ready);

    const inPopup = showsPopup(me) && confirmedKey !== (me.cards.offer ?? []).join(',');
    root.classList.toggle('popup-open', inPopup);
    root.classList.toggle('shop-open', !inPopup);
    popup.hidden = !inPopup;
    shop.hidden = inPopup;
    coinBox.hidden = inPopup;
    stick.zone.hidden = inPopup;
    if (inPopup !== wasPopup) ctx.sender.neutral();
    wasPopup = inPopup;

    if (inPopup) {
      const offer = me.cards.offer ?? [];
      // A new hand (next build phase) clears the local selection and the Confirm lock.
      const key = offer.join(',');
      if (key !== offerKey) {
        offerKey = key;
        selected = null;
        locked = false;
        if (lockTimer !== null) clearTimeout(lockTimer);
      }
      const g = growthText(me.cards.growth);
      growth.textContent = g ?? '';
      growth.hidden = g === null;
      renderCards(offer);
      confirm.disabled = selected === null || locked;
      return;
    }

    // ---- shop ----
    cards.set([]);
    coinsEl.textContent = team.coins.toLocaleString('en-US');
    const myId = ctx.myId();
    const shown = team.shop.filter((r) => r.visible);
    rows.set(
      shown.map((r) => {
        const req = requesters(team, r.id);
        const mine = req.mine(myId, me);
        return {
          key: r.id,
          sig: [
            r.tier,
            r.maxTier,
            r.price,
            r.holdToConfirm,
            team.coins >= (r.price ?? 0),
            req.names.join(','),
            mine,
          ].join('|'),
          make: () =>
            ShopRow(r, {
              coins: team.coins,
              requestedBy: req.names,
              mine,
              onBuy: (item) => ctx.intent({ k: 'buy', item }),
              onRequest: (item, on) => ctx.intent({ k: 'request', item, on }),
            }),
        };
      }),
    );
  };

  return {
    el: root,
    update: render,
    destroy() {
      window.removeEventListener('resize', onResize);
      if (lockTimer !== null) clearTimeout(lockTimer);
      clock.destroy();
      cards.destroy();
      rows.destroy();
      stick.destroy();
      ctx.sender.neutral();
    },
  };
}
