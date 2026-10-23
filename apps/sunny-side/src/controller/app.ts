// Controller app: owns the current screen view, the phone-local overlays, and the client wiring.
import type { ControllerClient, StorageLike } from '@pcg/net-client';
import type { ControllerMsg, Screen } from '../shared/messages';
import { createBanner } from './banner';
import { el } from './dom';
import { createInputSender, type InputSender } from './input/sender';
import { fullscreenOnTap } from './fullscreen';
import { watchOrientation } from './orientation';
import { GROUP_OF, SCREEN_KINDS, createView, type ViewGroup } from './screens';
import type { ScreenCtx, ScreenView } from './screens/common';
import { createJoining } from './screens/simple';
import { defaultStorage } from './storage';

export type OverlayName = 'selfPaused' | 'reconnecting' | 'hostAway' | 'rotate';
export const OVERLAY_NAMES: OverlayName[] = ['selfPaused', 'reconnecting', 'hostAway', 'rotate'];

export type ClientLike = Pick<
  ControllerClient,
  | 'status'
  | 'send'
  | 'connect'
  | 'close'
  | 'onMessage'
  | 'onStatus'
  | 'onHostStatus'
  | 'onKicked'
  | 'onError'
>;

export interface AppOptions {
  root: HTMLElement;
  client: ClientLike;
  /** Room code from `?code=`, shown on the joining screen. */
  code?: string | null;
  storage?: StorageLike;
  /** Called when the player types a code into the joining screen. */
  onCode?: (code: string) => void;
  /** Watches viewport orientation (default on). Tests/dev may disable. */
  watchOrientation?: boolean;
  /** Observes every phone→host message (dev readout). */
  onSent?: (msg: unknown) => void;
}

export interface App {
  readonly sender: InputSender;
  /** Applies a host screen (what a `{ t: 'screen' }` message does). */
  setScreen(screen: Screen): void;
  setOverlay(name: OverlayName, on: boolean): void;
  overlays(): OverlayName[];
  currentKind(): Screen['kind'] | 'joining';
  /** Connects; resolves when joined. Errors are shown on the joining screen. */
  start(): Promise<void>;
  destroy(): void;
}

const OVERLAY_TEXT: Record<OverlayName, { title: string; body: string }> = {
  selfPaused: { title: 'Paused', body: 'Your egg is standing still.' },
  reconnecting: { title: 'Reconnecting…', body: 'Hang tight, getting you back in.' },
  hostAway: { title: 'Host away', body: 'Waiting for the host screen to come back.' },
  rotate: { title: 'Rotate your phone', body: 'Sunny Side Shove plays in landscape.' },
};

const ERROR_TEXT: Record<string, string> = {
  'no-room': 'That room does not exist. Check the code on the TV.',
  'room-full': 'The room is full.',
  'room-locked': 'The match has started and the room is locked.',
  'room-closed': 'The room was closed.',
  'bad-request': 'Something went wrong joining.',
};

export function createApp(opts: AppOptions): App {
  const { root, client } = opts;
  const storage = opts.storage ?? defaultStorage();
  const sent = (m: unknown) => {
    client.send(m);
    opts.onSent?.(m);
  };
  const sender = createInputSender((t) => sent(t));

  const screenHost = el('div', { class: 'screen-host' });
  const overlayHost = el('div', { class: 'overlay-host' });
  const banner = createBanner();
  banner.setConnected(client.status === 'open');
  root.replaceChildren(banner.el, screenHost, overlayHost);

  let joinError: string | null = null;
  const joining = createJoining((c) => opts.onCode?.(c));
  let group: ViewGroup | 'joining' = 'joining';
  let view: ScreenView | null = null;
  let kind: Screen['kind'] | 'joining' = 'joining';
  const active = new Set<OverlayName>();
  const overlayEls = new Map<OverlayName, HTMLElement>();

  const ctx: ScreenCtx = {
    send: (m: ControllerMsg) => sent(m),
    storage,
    sender,
    onPause: () => selfPause(),
    pauseSlot: banner.slot,
  };

  const showJoining = () => {
    view?.destroy();
    view = null;
    group = 'joining';
    kind = 'joining';
    banner.setProfile(null, null);
    joining.set({ code: opts.code ?? null, error: joinError });
    screenHost.replaceChildren(joining.el);
  };

  const setScreen = (screen: Screen) => {
    banner.setProfile(screen.name, screen.color);
    const g = GROUP_OF[screen.kind];
    kind = screen.kind;
    if (g === group && view) {
      view.update(screen);
      return;
    }
    view?.destroy();
    view = createView(screen, ctx);
    group = g;
    screenHost.replaceChildren(view.el);
  };

  const renderOverlays = () => {
    for (const name of OVERLAY_NAMES) {
      const present = overlayEls.get(name);
      if (active.has(name) && !present) {
        const o = overlayFor(name);
        overlayEls.set(name, o);
        overlayHost.append(o);
      } else if (!active.has(name) && present) {
        present.remove();
        overlayEls.delete(name);
      }
    }
  };

  const overlayFor = (name: OverlayName): HTMLElement => {
    const t = OVERLAY_TEXT[name];
    const card = el(
      'div',
      { class: 'overlay-card' },
      el('h1', { class: 'h2 sticker-heading', text: t.title }),
      el('p', { class: 'body', text: t.body }),
    );
    if (name === 'selfPaused') {
      const resume = el('button', {
        type: 'button',
        class: 'btn btn-accent label',
        text: 'Resume',
      });
      resume.addEventListener('click', () => {
        sent({ t: 'resume' } satisfies ControllerMsg);
        setOverlay('selfPaused', false);
        if (group === 'controller') sender.start();
      });
      const leave = el('button', { type: 'button', class: 'btn label', text: 'Leave game' });
      leave.addEventListener('click', () => {
        sent({ t: 'leave' } satisfies ControllerMsg);
        setOverlay('selfPaused', false);
      });
      card.append(el('div', { class: 'actions' }, resume, leave));
    }
    return el('div', { class: 'overlay', 'data-overlay': name }, card);
  };

  function setOverlay(name: OverlayName, on: boolean) {
    if (on) active.add(name);
    else active.delete(name);
    renderOverlays();
  }

  function selfPause() {
    sender.neutral();
    sender.stop();
    sent({ t: 'pause' } satisfies ControllerMsg);
    setOverlay('selfPaused', true);
  }

  const offs: Array<() => void> = [fullscreenOnTap(root)];
  offs.push(
    client.onMessage((data) => {
      const m = data as { t?: unknown; screen?: Screen } | null;
      if (m && m.t === 'screen' && m.screen && SCREEN_KINDS.includes(m.screen.kind)) {
        setScreen(m.screen);
      }
    }),
    client.onStatus((s) => {
      banner.setConnected(s === 'open');
      setOverlay('reconnecting', s === 'reconnecting');
      if (s === 'closed' && group === 'joining') showJoining();
    }),
    client.onHostStatus((s) => setOverlay('hostAway', s === 'away')),
    client.onKicked(() => {
      active.delete('selfPaused');
      renderOverlays();
      // The host sends a `left` screen first when the player chose to leave; otherwise this is a removal.
      if (kind !== 'left') {
        joinError = 'You were removed from the room.';
        showJoining();
      }
    }),
    client.onError((e) => {
      joinError = ERROR_TEXT[e.code] ?? e.message;
      if (group === 'joining') showJoining();
    }),
  );
  if (opts.watchOrientation !== false) {
    offs.push(watchOrientation((portrait) => setOverlay('rotate', portrait)));
  }

  showJoining();
  if (client.status === 'reconnecting') setOverlay('reconnecting', true);

  return {
    sender,
    setScreen,
    setOverlay,
    overlays: () => OVERLAY_NAMES.filter((n) => active.has(n)),
    currentKind: () => kind,
    async start() {
      try {
        await client.connect();
      } catch (e) {
        const code = (e as { code?: string }).code;
        joinError =
          (code && ERROR_TEXT[code]) || (e instanceof Error ? e.message : 'Could not connect.');
        if (group === 'joining') showJoining();
      }
    },
    destroy() {
      sender.stop();
      for (const off of offs) off();
      view?.destroy();
    },
  };
}
