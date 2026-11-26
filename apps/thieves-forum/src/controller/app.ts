// Phone app (SPEC §3, §6.17, §6.18, §12.7; PLATFORM §3): the controller-kit app shell (Wake Lock, manual
// full-screen button, reconnecting / host-away / kicked / room-closed overlays, landscape with the rotate
// overlay, `?debug=1` diagnostics), a top banner (player color, name, connection dot, coin pill) on the
// in-round screens, and a screen router driven by the host's `screen` messages. Private messages (stall
// view, holds, sheets, bag, context, toasts) land in `state.ts` and the play screen reads them.
// The client, hold estimator (TF3) and tip viewer (TF4) are injected: main.ts passes the relay client,
// dev mode and tests fakes. Never imports host code (lint).
import { feedbackUrl } from '@pcg/catalog';
import {
  createAppShell,
  createScreenRouter,
  defaultStorage,
  readStored,
  showToast,
  writeStored,
  type ShellClient,
} from '@pcg/controller-kit';
import { title } from '../../game.meta';
import type { HoldEstimator } from '../shared/hold';
import {
  cleanName,
  GAME_ID,
  isHostMsg,
  NAME_MAX,
  PROTOCOL_VERSION,
  type PhoneMsg,
  type Screen,
} from '../shared/messages';
import { GAME_VERSION } from '../shared/version';
import { createControls, type Controls } from './controls';
import type { Ctx, View } from './ctx';
import { createFakeHoldEstimator } from './fakeHold';
import { applyHostMsg, clearRound, initialState, type PhoneState } from './state';
import { devTipViewer, type TipViewerFactory } from './tipViewer';
import { matchEndView, handsUpView, roundStartView, stocksView, walkOnView } from './screens/round';
import { lobbyView, rulesView, waitingView } from './screens/setup';
import { playView } from './screens/play';
import { el as h, money } from './ui';

const OVERLAYS = ['reconnecting', 'hostAway', 'rotate', 'kicked', 'closed'] as const;
type AppOverlay = 'kicked' | 'closed';
export type { AppOverlay };
export const OVERLAY_NAMES = OVERLAYS;

export const NAME_KEY = 'thieves-forum:name';
/** Set when Join had to reload the page under a new `?code=`: join again on arrival. */
export const AUTOJOIN_KEY = 'thieves-forum:autojoin';

const TEXT = {
  reconnecting: { title: 'Reconnecting…', body: 'Hang on, finding the game again.' },
  hostAway: { title: 'TV is away', body: 'Waiting for the TV to come back.' },
  rotate: { title: 'Turn your phone sideways', body: `${title} plays in landscape.` },
  kicked: { title: 'You were removed', body: 'Ask the group leader if you want back in.' },
  closed: { title: 'Game closed', body: 'This room is gone. Scan the TV for a new code.' },
};

/** Screens that carry the top banner (SPEC §6.17: "every in-round screen"). */
const BANNER_SCREENS = new Set<Screen['s']>(['roundStart', 'walkOn', 'play', 'handsUp', 'stocks']);

export interface AppOptions {
  root: HTMLElement;
  client: ShellClient;
  /** The room this page's client is joined to (`?code=`), or null. */
  code: string | null;
  /** Join with a different code: main.ts reloads under `?code=`. */
  goToRoom?: (code: string) => void;
  storage?: Parameters<typeof readStored>[1];
  session?: Parameters<typeof readStored>[1];
  platform?: Parameters<typeof createAppShell>[0]['platform'];
  /** TF3's phone estimator (injected; defaults to a local stand-in until wired, BUILD_PLAN §8). */
  estimator?: HoldEstimator;
  /** TF4's tip viewer factory (injected; defaults to a dev placeholder). */
  tipViewer?: TipViewerFactory;
  /** Monotonic ms clock shared by deadlines and the estimator (default `performance.now`). */
  now?: () => number;
  /** Frame scheduler (default `requestAnimationFrame`); tests pass a manual one. */
  raf?: (cb: () => void) => unknown;
  /** Called with every message the phone sends (dev readout). */
  onSent?: (m: PhoneMsg) => void;
}

export interface App {
  /** The current screen group: 'join', 'connected', or a host screen kind. */
  screen(): string;
  state: PhoneState;
  controls: Controls;
  setOverlay(name: AppOverlay | (typeof OVERLAYS)[number], on: boolean): void;
  overlays(): string[];
  destroy(): void;
}

function sessionStore(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined; // blocked: no auto-join after the reload, the player taps Join again
  }
}

export function createApp(opts: AppOptions): App {
  const { client } = opts;
  const storage = opts.storage ?? defaultStorage();
  const session = opts.session ?? sessionStore();
  const now = opts.now ?? (() => performance.now());
  const state = initialState();

  const banner = h('header', { class: 'top-banner', hidden: '' });
  const bannerName = h('span', { class: 'name-phone' });
  const dot = h('i', { class: 'conn-dot', 'aria-label': 'Connection' });
  const pill = h('button', { type: 'button', class: 'coin-pill money', 'data-role': 'coin-pill' });
  banner.append(h('span', { class: 'who' }, dot, bannerName), pill);

  const shell = createAppShell<AppOverlay>({
    root: opts.root,
    client,
    header: banner,
    overlays: OVERLAYS,
    text: TEXT,
    game: GAME_ID,
    version: GAME_VERSION,
    // Landscape game (SPEC §3): the kit's landscape lock and rotate overlay stay on. The corner
    // full-screen button sits top-left, clear of the right-hand action buttons.
    platform: { fullscreenCorner: 'top-left', ...opts.platform },
  });

  let joinedAs: string | null = null;
  let current = 'join';
  let active: View | null = null;
  let dismissToast: (() => void) | null = null;

  const send = (msg: PhoneMsg) => {
    opts.onSent?.(msg);
    client.send(msg);
  };
  const controls = createControls(send, now);
  const estimator = opts.estimator ?? createFakeHoldEstimator();
  const ctx: Ctx = {
    send,
    now,
    state,
    controls,
    estimator,
    tipViewer: opts.tipViewer ?? devTipViewer,
    feedbackUrl: feedbackUrl(GAME_ID),
  };

  // ---- banner ----
  const paintBanner = () => {
    const color = state.color;
    banner.style.setProperty('--pc', color ? `var(--player-${color})` : 'var(--surface-strong)');
    banner.style.setProperty('--pc-on', color ? `var(--player-${color}-on)` : 'var(--foreground)');
    bannerName.textContent = state.name;
    pill.textContent = money(state.bag);
    dot.classList.toggle('ok', client.status === 'open');
  };
  pill.addEventListener('click', () => {
    if (current !== 'play') return;
    state.packOpen = true;
    active?.refresh?.();
  });

  // ---- local screens ----
  function showJoin(error = ''): void {
    current = 'join';
    active = null;
    const form = h('form', { class: 'screen join', 'data-screen': 'join', novalidate: '' });
    const code = h('input', {
      name: 'code',
      class: 'code',
      autocomplete: 'off',
      autocapitalize: 'characters',
      maxlength: '4',
      placeholder: 'CODE',
      'aria-label': 'Room code',
    });
    code.value = opts.code ?? '';
    const name = h('input', {
      name: 'name',
      class: 'label',
      autocomplete: 'nickname',
      maxlength: String(NAME_MAX),
      placeholder: 'Your name',
      'aria-label': 'Your name',
    });
    name.value = readStored(NAME_KEY, storage) ?? '';
    const err = h('p', { class: 'caption join-error', role: 'alert' }, error);
    const button = h(
      'button',
      { type: 'submit', class: 'primary button coin-edge', 'data-action': 'join' },
      'Join',
    );
    form.append(h('h1', { class: 'banner' }, title), code, name, err, button);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const room = code.value.trim().toUpperCase();
      const n = cleanName(name.value);
      if (!/^[A-Z]{4}$/.test(room))
        return void (err.textContent = 'Enter the 4-letter code on the TV.');
      if (!n) return void (err.textContent = 'Enter your name.');
      writeStored(NAME_KEY, n, storage);
      if (room !== opts.code) {
        writeStored(AUTOJOIN_KEY, room, session);
        opts.goToRoom?.(room);
        return;
      }
      joinedAs = n;
      button.disabled = true;
      button.textContent = 'Joining…';
      if (client.status === 'open') send({ t: 'join', name: n, proto: PROTOCOL_VERSION });
    });
    router.showLocal('join', form);
    banner.hidden = true;
    if (opts.code && readStored(AUTOJOIN_KEY, session) === opts.code && name.value) {
      writeStored(AUTOJOIN_KEY, '', session);
      form.requestSubmit();
    }
  }

  function showConnected(name: string): void {
    current = 'connected';
    active = null;
    const box = h('section', { class: 'screen connected', 'data-screen': 'connected' });
    box.append(
      h('p', { class: 'name-phone' }, name),
      h('h1', { class: 'banner' }, 'Connected'),
      h('p', { class: 'body' }, 'Watch the TV.'),
    );
    router.showLocal('connected', box);
    banner.hidden = true;
  }

  function showOutdated(): void {
    current = 'outdated';
    active = null;
    router.showLocal(
      'outdated',
      h(
        'section',
        { class: 'screen outdated', 'data-screen': 'outdated' },
        h('h1', { class: 'banner' }, 'Update needed'),
        h('p', { class: 'body' }, 'This page is out of date. Reload it to join.'),
      ),
    );
    banner.hidden = true;
  }

  // ---- router ----
  const create = (s: Screen): View => {
    switch (s.s) {
      case 'lobby':
        return lobbyView(ctx, s);
      case 'rules':
        return rulesView(ctx, s);
      case 'roundStart':
        return roundStartView(ctx, s);
      case 'walkOn':
        return walkOnView(ctx, s);
      case 'play':
        return playView(ctx, s);
      case 'handsUp':
        return handsUpView(ctx, s);
      case 'stocks':
        return stocksView(ctx, s);
      case 'matchEnd':
        return matchEndView(ctx, s);
      case 'waiting':
        return waitingView(ctx, s);
      case 'joining': {
        const box = h(
          'section',
          { class: 'screen connected', 'data-screen': 'connected' },
          h('p', { class: 'name-phone' }, state.name),
          h('h1', { class: 'banner' }, 'Connected'),
          h('p', { class: 'body' }, 'Watch the TV.'),
        );
        return { el: box, update() {}, destroy: () => box.remove() };
      }
    }
  };
  const router = createScreenRouter<Screen, string>({
    host: shell.screenHost,
    groupOf: (s) => (s.s === 'joining' ? 'connected' : s.s),
    create: (s) => (active = create(s)),
  });

  function onScreen(s: Screen): void {
    if (s.s === 'lobby') {
      const me = s.players[s.you];
      if (me) {
        state.color = me.color;
        state.name = me.name;
      }
    } else if (s.s === 'play') {
      state.name = s.name;
      state.color = s.color;
    }
    if (s.s !== 'play') clearRound(state);
    controls.setActive(s.s === 'play');
    current = s.s === 'joining' ? 'connected' : s.s;
    router.show(s);
    banner.hidden = !BANNER_SCREENS.has(s.s);
    paintBanner();
  }

  function toast(kind: string, text: string): void {
    dismissToast?.();
    dismissToast = showToast(opts.root, text, { className: `pcg-toast toast-${kind}` });
  }

  const offs = [
    client.onMessage((d) => {
      if (!isHostMsg(d)) return;
      if (d.t === 'joined') {
        state.name = d.name;
        if (current === 'join') showConnected(d.name);
      } else if (d.t === 'outdated') showOutdated();
      else if (d.t === 'screen') onScreen(d.screen);
      else {
        const t = now();
        if (d.t === 'holdStart' || d.t === 'holdEnd') estimator.correct(d, t);
        const fx = applyHostMsg(state, d, t);
        if (fx.toast) toast(fx.toast.kind, fx.toast.text);
        paintBanner();
        active?.refresh?.();
      }
    }),
    client.onStatus((s) => {
      if (s === 'open' && joinedAs) send({ t: 'join', name: joinedAs, proto: PROTOCOL_VERSION });
      paintBanner();
    }),
    client.onKicked(() => shell.setOverlay('kicked', true)),
    client.onError((e) => {
      if (e.code === 'room-closed' || e.code === 'no-room') shell.setOverlay('closed', true);
    }),
  ];

  // Frame loop: countdowns, cooldowns and hold bars.
  let alive = true;
  const schedule =
    opts.raf ??
    ((cb: () => void) =>
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : setTimeout(cb, 33));
  const frame = () => {
    if (!alive) return;
    active?.tick?.(now());
    schedule(frame);
  };
  schedule(frame);

  showJoin();

  return {
    screen: () => current,
    state,
    controls,
    setOverlay: (n, on) => shell.setOverlay(n, on),
    overlays: () => shell.overlays(),
    destroy() {
      alive = false;
      for (const off of offs) off();
      controls.setActive(false);
      router.destroy();
      shell.destroy();
    },
  };
}
