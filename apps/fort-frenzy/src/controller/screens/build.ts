// Build phase (SPEC §10.2, §10.3, §15.7): the Shop view, full screen, no tabs and no stick: coins, your
// private 1-of-3 card, the team shop rows, Request toggles, the timer, pause and Ready. (RD2 cut the
// Build tab, Give and the cell action; the build button returns in a later milestone.)
import { el } from '@pcg/controller-kit';
import type { MeView, TeamView } from '../../shared/messages';
import { ShopRow, StatusStrip, UpgradeCard, icon } from '../components';
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

export function createBuild(ctx: ScreenCtx): View {
  const root = el('section', { class: 'screen build shop-open' });
  const phase = el('span', { class: 'phase-clock tag' });
  const strip = StatusStrip();
  const clock = createCountdown(phase, (ms) => `BUILD PHASE · ${Math.ceil(ms / 1000)} S`, ctx.now);

  // shop
  const coinsEl = el('span', { class: 'coins score' });
  const coinBox = el('div', { class: 'coin-box' }, icon('coins', 'coin-glyph'), coinsEl);
  const cardsHost = el('div', { class: 'cards' });
  const cards = createKeyedList(cardsHost);
  const cardTitle = el('p', { class: 'section-title tag' });
  const rowsHost = el('div', { class: 'shop-rows' });
  const rows = createKeyedList(rowsHost);
  const shopHint = el('p', {
    class: 'hint body',
    text: 'Big buys need a press-and-hold. Request puts an item on the TV wishlist.',
  });
  const shopBody = el(
    'div',
    { class: 'tab-body shop-body' },
    el('div', { class: 'shop-cards' }, cardTitle, cardsHost),
    el(
      'div',
      { class: 'shop-list' },
      el('p', { class: 'section-title tag', text: 'TEAM SHOP · ANYONE CAN BUY' }),
      rowsHost,
      shopHint,
    ),
  );

  const ready = el('button', { type: 'button', class: 'btn btn-outline ready' });
  const footer = el('div', { class: 'build-footer' }, ready);

  const panel = el('div', { class: 'build-panel' }, shopBody, footer, coinBox);
  const topRow = el('div', { class: 'build-top' }, phase);
  const pause = createPauseControl(ctx);
  let wasPaused = false;
  root.append(topRow, strip.el, panel, pause.button, pause.layer);

  let last: Snapshot | null = null;
  ready.addEventListener('click', () => last && ctx.intent({ k: 'ready', ready: !last.me.ready }));

  const update = (s: Snapshot) => {
    last = s;
    const { me, team } = s;
    // Paused (FF14-fix-1): nothing held may carry over once the run resumes.
    const isPaused = pause.set(s);
    if (isPaused && !wasPaused) ctx.sender.neutral();
    wasPaused = isPaused;
    clock.set(team.buildEndsInMs);
    strip.update(me, team);
    ready.replaceChildren(
      icon('ready', 'ready-glyph'),
      el('span', { text: me.ready ? 'READY ✓' : 'READY' }),
    );
    ready.classList.toggle('on', me.ready);

    // ---- shop ----
    coinsEl.textContent = team.coins.toLocaleString('en-US');
    const offer = me.cards.offer;
    cardTitle.textContent = offer ? 'YOUR UPGRADE · PICK 1' : 'YOUR UPGRADE';
    const picked = me.cards.picked;
    const cardItems = picked
      ? [{ id: picked, state: 'picked' as const }]
      : (offer ?? []).map((id) => ({ id, state: 'offer' as const }));
    cards.set(
      cardItems.map((c) => ({
        key: c.id,
        sig: `${c.id}|${c.state}`,
        make: () => ({
          el: UpgradeCard(c.id, {
            state: c.state,
            onTake: () => ctx.intent({ k: 'card', card: c.id }),
          }),
        }),
      })),
    );
    if (cardItems.length === 0)
      cardsHost.replaceChildren(el('p', { class: 'body hint', text: 'No upgrade this phase.' }));

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
    update,
    destroy() {
      clock.destroy();
      cards.destroy();
      rows.destroy();
      ctx.sender.neutral();
    },
  };
}
