// Controller app: owns the current screen view, the phone-local overlays, and the client wiring. The
// kit's app shell turns the phone platform on (fullscreen on tap, Wake Lock, landscape lock, rotate
// overlay) and drives the reconnecting / host-away overlays; the screen router reuses a view within a
// screen group.
import {
  createAppShell,
  createScreenRouter,
  defaultStorage,
  el,
  type ShellClient,
} from '@pcg/controller-kit';
import type { StorageLike } from '@pcg/net-client';
import type { ControllerMsg, Screen } from '../shared/messages';
import { createBanner } from './banner';
import { createInputSender, type InputSender } from './input/tuple';
import { GROUP_OF, SCREEN_KINDS, createView, type ViewGroup } from './screens';
import type { ScreenCtx } from './screens/common';
import { createJoining, createRemoved } from './screens/simple';
import { GAME_ID } from '../shared/messages';

export type OverlayName = 'selfPaused' | 'reconnecting' | 'hostAway' | 'rotate';
export const OVERLAY_NAMES: OverlayName[] = ['selfPaused', 'reconnecting', 'hostAway', 'rotate'];

export type ClientLike = ShellClient;

export interface AppOptions {
  root: HTMLElement;
  client: ClientLike;
  /** Room code from `?code=`, shown on the joining screen. */
  code?: string | null;
  storage?: StorageLike;
  /** Reloads the page at `?code=CODE` (default: location.assign). Tests may stub it. */
  reload?: (code: string) => void;
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
  currentKind(): Screen['kind'] | 'joining' | 'removed';
  /** Shows the phone-local removed screen (what a non-Leave `kicked` close does). */
  showRemoved(): void;
  /** Connects; resolves when joined. Errors are shown on the joining screen. */
  start(): Promise<void>;
  destroy(): void;
}

const OVERLAY_TEXT: Record<OverlayName, { title: string; body: string }> = {
  selfPaused: { title: 'Paused', body: 'Your egg is standing still.' },
  reconnecting: { title: 'Reconnecting…', body: 'Hang tight, getting you back in.' },
  hostAway: { title: 'Host away', body: 'Waiting for the host screen to come back.' },
  rotate: { title: 'Rotate your phone', body: 'Sunny Side Slam plays in landscape.' },
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

  const banner = createBanner();
  banner.setConnected(client.status === 'open');

  const resumeActions = () => {
    const resume = el('button', {
      type: 'button',
      class: 'btn btn-accent label',
      text: 'Resume',
    });
    resume.addEventListener('click', () => {
      sent({ t: 'resume' } satisfies ControllerMsg);
      setOverlay('selfPaused', false);
      if (router.group() === 'controller') sender.start();
    });
    const leave = el('button', { type: 'button', class: 'btn label', text: 'Leave game' });
    leave.addEventListener('click', () => {
      sent({ t: 'leave' } satisfies ControllerMsg);
      setOverlay('selfPaused', false);
    });
    return el('div', { class: 'actions' }, resume, leave);
  };

  const shell = createAppShell<OverlayName>({
    root,
    client,
    header: banner.el,
    overlays: OVERLAY_NAMES,
    text: OVERLAY_TEXT,
    overlayClasses: { title: 'h2 sticker-heading', body: 'body' },
    overlayExtra: (name) => (name === 'selfPaused' ? resumeActions() : null),
    platform: { rotate: opts.watchOrientation !== false },
  });
  const setOverlay = (name: OverlayName, on: boolean) => shell.setOverlay(name, on);

  const ctx: ScreenCtx = {
    send: (m: ControllerMsg) => sent(m),
    storage,
    sender,
    onPause: () => selfPause(),
    pauseSlot: banner.slot,
  };
  const router = createScreenRouter<Screen, ViewGroup>({
    host: shell.screenHost,
    groupOf: (screen) => GROUP_OF[screen.kind],
    create: (screen) => createView(screen, ctx),
  });

  let joinError: string | null = null;
  const joining = createJoining((c) => opts.onCode?.(c));
  let kind: Screen['kind'] | 'joining' | 'removed' = 'joining';

  const showJoining = () => {
    kind = 'joining';
    banner.setProfile(null, null);
    joining.set({ code: opts.code ?? null, error: joinError });
    router.showLocal('joining', joining.el);
  };

  const joinAgain = () => {
    const code = opts.code ?? '';
    try {
      storage?.removeItem(`pcg:token:${GAME_ID}:${code}`);
    } catch {
      /* private mode */
    }
    if (opts.reload) opts.reload(code);
    else location.assign(`/play?code=${encodeURIComponent(code)}`);
  };

  const showRemoved = () => {
    sender.neutral();
    sender.stop();
    kind = 'removed';
    banner.setProfile(null, null);
    const view = createRemoved(joinAgain);
    router.showLocal('removed', view.el, view);
  };

  const setScreen = (screen: Screen) => {
    banner.setProfile(screen.name, screen.color);
    kind = screen.kind;
    router.show(screen);
  };

  function selfPause() {
    sender.neutral();
    sender.stop();
    sent({ t: 'pause' } satisfies ControllerMsg);
    setOverlay('selfPaused', true);
  }

  const offs: Array<() => void> = [];
  offs.push(
    client.onMessage((data) => {
      const m = data as { t?: unknown; screen?: Screen } | null;
      if (m && m.t === 'screen' && m.screen && SCREEN_KINDS.includes(m.screen.kind)) {
        setScreen(m.screen);
      }
    }),
    client.onStatus((s) => {
      banner.setConnected(s === 'open');
      if (s === 'closed' && router.group() === 'joining') showJoining();
    }),
    client.onKicked(() => {
      setOverlay('selfPaused', false);
      // The host sends a `left` screen first when the player chose to leave; otherwise this is a removal.
      if (kind !== 'left') showRemoved();
    }),
    client.onError((e) => {
      joinError = ERROR_TEXT[e.code] ?? e.message;
      if (router.group() === 'joining') showJoining();
    }),
  );

  showJoining();

  return {
    sender,
    setScreen,
    setOverlay,
    overlays: () => shell.overlays(),
    currentKind: () => kind,
    showRemoved,
    async start() {
      try {
        await client.connect();
      } catch (e) {
        const code = (e as { code?: string }).code;
        joinError =
          (code && ERROR_TEXT[code]) || (e instanceof Error ? e.message : 'Could not connect.');
        if (router.group() === 'joining') showJoining();
      }
    },
    destroy() {
      sender.stop();
      for (const off of offs) off();
      shell.destroy();
      router.destroy();
    },
  };
}
