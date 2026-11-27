// The in-round controller (SPEC §6.17, §12.7): floating joystick on the left, outfit card in a corner,
// and on the right the context main button (BROWSE / SELL / PICKPOCKET, hold bar for PICKPOCKET) with
// Toss coin (cooldown), Tip guard and Catch!. Sheets (stall view, dialog, sell, pawn, pack) open over it
// and keep the joystick; the tip-off screen freezes it. The top banner belongs to the app shell.
// Never imports host code.
import {
  createHoldButton,
  createJoystick,
  type HoldButton,
  type Joystick,
} from '@pcg/controller-kit';
import type { Screen } from '../../shared/messages';
import type { Ctx, View } from '../ctx';
import { expireHold, holdPct, pressHold, releaseHold } from '../holds';
import { outfitCard } from '../outfit';
import { MAIN_LABEL } from '../state';
import { btn, el, money, secs, setText } from '../ui';
import {
  dialogSheet,
  packSheet,
  pawnSheet,
  sellSheet,
  tipScreen,
  type DialogMode,
  type PawnSheetEl,
  type TipScreen,
} from './sheets';
import { createStallPane, type StallPane } from './stall';

/** How long the CAUGHT! banner stays over the controller, ms (guard catches move on to the stocks). */
const CAUGHT_BANNER_MS = 3500;

export function playView(ctx: Ctx, _first: Extract<Screen, { s: 'play' }>): View {
  const st = ctx.state;
  const zone = el('div', { class: 'stick-zone' });
  const joystick: Joystick = createJoystick(zone, {
    idleOpacity: 0.55,
    easeBackMs: 120,
    onChange: (x, y) => ctx.controls.stick(x, y),
    onTouch: (down) => ctx.controls.touchStick(down),
  });

  // ---- right-hand buttons ----
  const mainBar = el('span', { class: 'hold-bar main-bar', hidden: '' }, el('i'));
  const main = el('button', {
    type: 'button',
    class: 'btn primary coin-edge main',
    'data-role': 'main',
  });
  const mainHb: HoldButton = createHoldButton(main, (down) => {
    if (!down) return releaseHold(ctx);
    if (st.main === 'pickpocket') pressHold(ctx, 'pickpocket');
    else if (st.main) ctx.send({ t: 'browse' });
  });
  const toss = btn(
    'Toss coin',
    'bronze',
    () => ctx.send({ t: 'toss', x: ctx.controls.aim()[0], y: ctx.controls.aim()[1] }),
    {
      'data-role': 'toss',
    },
  );
  const tipBtn = btn('Tip guard', 'bronze', () => ctx.send({ t: 'tipOpen' }), {
    'data-role': 'tip',
  });
  const catchBtn = el('button', {
    type: 'button',
    class: 'btn bronze danger',
    'data-role': 'catch',
    text: 'Catch!',
  });
  const catchHb = createHoldButton(catchBtn, (down) => ctx.controls.catchBit(down));
  const buttons = el(
    'div',
    { class: 'actions' },
    el('div', { class: 'main-wrap' }, mainBar, main),
    el('div', { class: 'secondary' }, toss, tipBtn, catchBtn),
  );
  const corner = el('div', { class: 'outfit-corner' });
  const caught = el('div', { class: 'caught-banner', role: 'status', hidden: '' });
  const layer = el('div', { class: 'layer' });
  const root = el(
    'section',
    { class: 'screen play', 'data-screen': 'play' },
    zone,
    corner,
    buttons,
    caught,
    layer,
  );

  // ---- sheets ----
  let stallPane: StallPane | null = null;
  let dialogMode: DialogMode = 'main';
  let dialogEl: HTMLElement | null = null;
  let dialogSig = '';
  let sellEl: HTMLElement | null = null;
  let sellSig = '';
  let sellClosed: unknown = null;
  let pawnEl: PawnSheetEl | null = null;
  let pawnSig = '';
  let pawnClosed: unknown = null;
  let packEl: HTMLElement | null = null;
  let packSig = '';
  let tipEl: TipScreen | null = null;
  let tipFor: unknown = null;
  let outfitSig = '';

  const setLayer = () => {
    const kids = [stallPane?.el, dialogEl, sellEl, pawnEl?.el, packEl, tipEl?.el].filter(
      (n): n is HTMLElement => !!n,
    );
    const have = [...layer.children];
    if (kids.length !== have.length || kids.some((n, i) => n !== have[i]))
      layer.replaceChildren(...kids);
  };
  const drop = (n: HTMLElement | null) => n?.remove();

  const sheets = () => {
    // Stall view: in place while it stays open; gone on `stallView null` (walking away).
    if (st.stall) {
      if (stallPane) stallPane.update(st.stall);
      else stallPane = createStallPane(ctx, st.stall);
    } else if (stallPane) {
      releaseHold(ctx);
      stallPane.destroy();
      stallPane = null;
    }

    const dsig = st.dialog ? `${dialogMode}|${JSON.stringify(st.dialog)}` : '';
    if (dsig !== dialogSig) {
      dialogSig = dsig;
      drop(dialogEl);
      if (!st.dialog) dialogMode = 'main';
      dialogEl = st.dialog
        ? dialogSheet(ctx, dialogMode, (m) => {
            dialogMode = m;
            sheets();
          })
        : null;
    }

    const wantSell = st.sell !== null && sellClosed !== st.sell;
    const ssig = wantSell ? JSON.stringify([st.sell, st.pack]) : '';
    if (ssig !== sellSig) {
      sellSig = ssig;
      drop(sellEl);
      sellEl = wantSell ? sellSheet(ctx, () => ((sellClosed = st.sell), sheets())) : null;
    }

    const wantPawn = st.pawn !== null && pawnClosed !== st.pawn.sheet;
    const wsig = wantPawn ? JSON.stringify([st.pawn?.sheet, st.pack, st.weight, st.cap]) : '';
    if (wsig !== pawnSig) {
      pawnSig = wsig;
      drop(pawnEl?.el ?? null);
      pawnEl = wantPawn ? pawnSheet(ctx, () => ((pawnClosed = st.pawn?.sheet), sheets())) : null;
    }

    const psig = st.packOpen ? JSON.stringify([st.pack, st.weight, st.cap]) : '';
    if (psig !== packSig) {
      packSig = psig;
      drop(packEl);
      packEl = st.packOpen
        ? packSheet(ctx, () => {
            st.packOpen = false;
            sheets();
          })
        : null;
    }

    const snapshot = st.tip?.snapshot ?? null;
    if (snapshot !== tipFor) {
      tipFor = snapshot;
      if (tipEl) {
        tipEl.destroy();
        tipEl.el.remove();
      }
      tipEl = st.tip
        ? tipScreen(ctx, () => {
            ctx.send({ t: 'tipCancel' });
            st.tip = null;
            sheets();
          })
        : null;
    }
    ctx.controls.freeze(st.tip !== null);
    zone.classList.toggle('disabled', st.tip !== null);
    root.classList.toggle('stall-open', stallPane !== null);
    setLayer();
  };

  const buttonsNow = (now: number) => {
    const m = st.main;
    main.disabled = m === null;
    main.dataset.main = m ?? 'none';
    setText(main, m ? MAIN_LABEL[m] : '');
    const cool = Math.max(0, st.tossReadyAt - now);
    toss.disabled = cool > 0;
    toss.dataset.cooldown = String(secs(cool));
    setText(toss, cool > 0 ? `Toss coin ${secs(cool)}` : 'Toss coin');
    tipBtn.disabled = !st.tipOk || st.tip !== null;
    (catchBtn as HTMLButtonElement).disabled = !st.catchOk;
  };

  const outfitNow = () => {
    const sig = JSON.stringify(st.outfit);
    if (sig === outfitSig) return;
    outfitSig = sig;
    corner.replaceChildren(
      ...(st.outfit
        ? [outfitCard(st.outfit, true), el('span', { class: 'caption', text: 'You' })]
        : []),
    );
  };

  const tick = (now: number) => {
    expireHold(ctx, now);
    buttonsNow(now);
    const pct = holdPct(ctx, 'pickpocket', undefined, now);
    mainBar.hidden = pct === null;
    if (pct !== null) {
      (mainBar.firstElementChild as HTMLElement).style.width = `${pct}%`;
      mainBar.dataset.progress = String(pct);
      mainBar.style.setProperty('--p', String(pct));
    } else delete mainBar.dataset.progress;
    stallPane?.tick(now);
    pawnEl?.tick(now);
    tipEl?.tick(now);
    const c = st.caught;
    const show = !!c && now - c.at < CAUGHT_BANNER_MS;
    caught.hidden = !show;
    if (show) setText(caught, `CAUGHT! −${money(c.pot)}`);
  };

  const refresh = () => {
    outfitNow();
    sheets();
    tick(ctx.now());
  };
  refresh();

  return {
    el: root,
    update: () => refresh(),
    refresh,
    tick,
    destroy() {
      releaseHold(ctx);
      ctx.controls.freeze(false);
      joystick.destroy();
      mainHb.destroy();
      catchHb.destroy();
      stallPane?.destroy();
      tipEl?.destroy();
      root.remove();
    },
  };
}
