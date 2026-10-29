// Build phase (SPEC §10.2, §10.3, §15.7): every player has a Build tab and a Shop tab. Build keeps the
// stick; the right side shows the kit tiles with costs, Place / Cancel, or "No buildings to build".
// Shop is full screen (the stick returns with the Build tab): coins, your private 1-of-3 card, the team
// shop rows, Request toggles. Both tabs keep Give, the build-phase action button (rows 1-4) and Ready.
import { bindGesture, el, readSafeInsets, tapGesture } from '@pcg/controller-kit';
import type { MeView, TeamView } from '../../shared/messages';
import { RoundButton, ShopRow, StatusStrip, UpgradeCard, KitTile, icon } from '../components';
import { BUILD_PHASE_ACTIONS, STRUCTURE_INFO, actionIcon, giveIcon } from '../copy';
import { layoutCombat } from '../layout';
import { mountStick } from './combat';
import {
  createCountdown,
  createKeyedList,
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
  const root = el('section', { class: 'screen build' });
  const phase = el('span', { class: 'phase-clock tag' });
  const strip = StatusStrip();
  const stick = mountStick(root, ctx.sender);
  const clock = createCountdown(phase, (ms) => `BUILD PHASE · ${Math.ceil(ms / 1000)} S`, ctx.now);

  // ---- panel: tabs, body, footer ----
  const tabBuild = el('button', {
    type: 'button',
    class: 'tab on',
    'data-tab': 'build',
    text: 'BUILD',
  });
  const tabShop = el('button', { type: 'button', class: 'tab', 'data-tab': 'shop', text: 'SHOP' });
  const tabs = el('div', { class: 'tabs', role: 'tablist' }, tabBuild, tabShop);

  // build tab
  const kitHost = el('div', { class: 'kit-tiles' });
  const kit = createKeyedList(kitHost);
  const noKit = el('p', { class: 'no-kit body', text: 'No buildings to build' });
  const place = el('button', { type: 'button', class: 'btn btn-primary place', text: 'PLACE' });
  const cancel = el('button', { type: 'button', class: 'btn cancel', text: 'CANCEL' });
  const placeRow = el('div', { class: 'place-row' }, place, cancel);
  const buildHint = el('p', { class: 'hint body' });
  const buildBody = el(
    'div',
    { class: 'tab-body build-body' },
    kitHost,
    noKit,
    placeRow,
    buildHint,
  );

  // shop tab
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
  shopBody.hidden = true;

  // footer: cells, Give, action, Ready (both tabs)
  const cells = el('span', { class: 'crate-count' });
  const give = el('button', { type: 'button', class: 'btn give', 'aria-label': 'Give a cell' });
  const act = RoundButton('action', 'act-pickup');
  act.el.classList.add('inline');
  const ready = el('button', { type: 'button', class: 'btn btn-outline ready' });
  const footer = el('div', { class: 'build-footer' }, cells, give, act.el, ready);

  const panel = el('div', { class: 'build-panel' }, tabs, buildBody, shopBody, footer, coinBox);
  const topRow = el('div', { class: 'build-top' }, phase);
  root.append(topRow, strip.el, panel);

  let last: Snapshot | null = null;
  const setTab = (t: 'build' | 'shop') => {
    root.classList.toggle('shop-open', t === 'shop');
    tabBuild.classList.toggle('on', t === 'build');
    tabShop.classList.toggle('on', t === 'shop');
    buildBody.hidden = t !== 'build';
    shopBody.hidden = t !== 'shop';
    // The stick only exists on the Build tab.
    stick.zone.hidden = t === 'shop';
    if (t === 'shop') ctx.sender.update({ moveX: 0, moveY: 0 });
  };
  tabBuild.addEventListener('click', () => setTab('build'));
  tabShop.addEventListener('click', () => setTab('shop'));

  const placeStick = () => {
    const l = layoutCombat(
      { width: root.clientWidth || innerWidth, height: root.clientHeight || innerHeight },
      readSafeInsets(),
    );
    stick.place(l.stick);
  };
  window.addEventListener('resize', placeStick);
  placeStick();

  place.addEventListener('click', () => ctx.intent({ k: 'build', action: 'place' }));
  cancel.addEventListener('click', () => ctx.intent({ k: 'build', action: 'cancel' }));
  give.addEventListener('click', () => ctx.intent({ k: 'give' }));
  ready.addEventListener('click', () => last && ctx.intent({ k: 'ready', ready: !last.me.ready }));

  // The action button outside combat is a plain tap (rows 1-4); Give has its own button.
  const actBinding = bindGesture(act.el, tapGesture(), {
    onState: (st) => ctx.sender.touch('action', st.pressed),
    onOutput: () => ctx.sender.bump('actionTaps'),
  });

  const update = (s: Snapshot) => {
    last = s;
    const { me, team } = s;
    clock.set(team.buildEndsInMs);
    strip.update(me, team);

    // ---- footer ----
    cells.replaceChildren(icon('cell', 'cell-glyph'), `${me.crates}/${me.carryCap}`);
    cells.title = 'Cells carried';
    const g = giveIcon(me.give);
    give.replaceChildren(
      icon(g.id, 'give-glyph'),
      el('span', { text: me.give === 'drop' ? 'DROP' : 'GIVE' }),
    );
    give.classList.toggle('dimmed', g.dimmed || me.crates === 0);
    const a = actionIcon(me.action);
    const applies = BUILD_PHASE_ACTIONS.includes(me.action);
    act.setIcon(a.id, a.dimmed || !applies);
    ready.replaceChildren(
      icon('ready', 'ready-glyph'),
      el('span', { text: me.ready ? 'READY ✓' : 'READY' }),
    );
    ready.classList.toggle('on', me.ready);

    // ---- build tab ----
    const hasKit = me.buildKit.length > 0;
    kitHost.hidden = !hasKit;
    placeRow.hidden = !hasKit;
    noKit.hidden = hasKit;
    buildHint.hidden = !hasKit;
    const selected = me.build?.selected ?? null;
    const valid = me.build?.valid ?? null;
    kit.set(
      me.buildKit.map((id) => {
        const affordable = STRUCTURE_INFO[id].cost <= me.crates;
        return {
          key: id,
          sig: `${id}|${selected === id}|${affordable}`,
          make: () => ({
            el: KitTile(id, { selected: selected === id, affordable }, () =>
              ctx.intent({ k: 'build', action: 'select', structure: id }),
            ),
          }),
        };
      }),
    );
    place.disabled = selected === null || valid === false;
    cancel.disabled = selected === null;
    buildHint.textContent =
      selected === null
        ? 'Pick a building. Its ghost appears at your feet on the TV.'
        : valid === false
          ? 'Blocked. Walk somewhere else.'
          : 'The ghost is at your feet on the TV. Walk to move it; red means blocked.';

    // ---- shop tab ----
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
    const shown = team.shop.filter(
      (r) => r.visible && (!r.qmOnly || me.classId === 'quartermaster'),
    );
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
      window.removeEventListener('resize', placeStick);
      actBinding.destroy();
      clock.destroy();
      kit.destroy();
      cards.destroy();
      rows.destroy();
      stick.destroy();
      ctx.sender.neutral();
    },
  };
}
