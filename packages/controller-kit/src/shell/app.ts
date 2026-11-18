// App shell: lays out `header? + .screen-host + .overlay-host` in the root and turns the phone platform
// on by default (PLATFORM §3): Wake Lock on the first touch (with a one-time "keep your screen on" hint
// where it's missing), a manual full-screen corner button (no automatic full screen: controller-compat),
// the locked viewport, the rotate overlay in portrait, the reconnecting / host-away overlays from the
// client's status, and the `?debug=1` diagnostics overlay. Games mount screens in `screenHost` (see
// createScreenRouter).
import type { ControllerClient } from '@pcg/net-client';
import { createDiagnosticsOverlay, diagnosticsEnabled } from '../diagnostics/overlay';
import { el } from '../dom';
import { fullscreenOnTap } from '../platform/fullscreen';
import { createKeepAwakeHint, type KeepAwakeText } from '../platform/keepAwake';
import { watchOrientation } from '../platform/orientation';
import { showToast } from '../platform/toast';
import { lockViewport } from '../platform/viewport';
import { createWakeLock, type WakeLock } from '../platform/wakeLock';
import {
  createFullscreenButton,
  type FullscreenButton,
  type FullscreenButtonText,
  type FullscreenCorner,
} from '../widgets/fullscreenButton';
import {
  createOverlayLayer,
  type OverlayClasses,
  type OverlayLayer,
  type OverlayText,
} from './overlays';

/** The overlays the shell drives itself. */
export const SHELL_OVERLAYS = ['reconnecting', 'hostAway', 'rotate'] as const;
export type ShellOverlay = (typeof SHELL_OVERLAYS)[number];

/** The ControllerClient surface a controller app uses (the dev fake implements the same). */
export type ShellClient = Pick<
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

export interface ShellPlatform {
  /**
   * Deprecated (controller-compat): automatic full screen on every tap. Default now false; games
   * shouldn't turn it back on. Full screen is the player's choice through `fullscreenButton`.
   */
  fullscreen?: boolean;
  /** The full-screen corner button (default true). See `createFullscreenButton`. */
  fullscreenButton?: boolean;
  /** Its corner: pick one clear of the game's controls. Default `top-right`. */
  fullscreenCorner?: FullscreenCorner;
  /** Screen Wake Lock, taken on the first touch (default true). */
  wakeLock?: boolean;
  /** The one-time "keep your screen on" hint where Wake Lock is missing (default true). */
  keepAwakeHint?: boolean;
  /**
   * Landscape lock after the player enters full screen with the button, where supported (default
   * true). It no longer requests full screen by itself.
   */
  landscape?: boolean;
  /** Rotate overlay while the viewport is portrait (default true). */
  rotate?: boolean;
  /** Locked viewport meta + no pinch zoom (default true). */
  viewport?: boolean;
  /** Diagnostics overlay. Default: on only with `?debug=1`. */
  diagnostics?: boolean;
}

export interface AppShellOptions<N extends string> {
  root: HTMLElement;
  /**
   * Drives the reconnecting / host-away overlays; the diagnostics overlay also reads `playerId`,
   * `hostStatus` and `getStats` when present.
   */
  client?: Pick<ShellClient, 'status' | 'onStatus' | 'onHostStatus'> &
    Partial<Pick<ControllerClient, 'playerId' | 'hostStatus' | 'getStats'>>;
  /** Mounted before the screen host (e.g. a top banner). */
  header?: Node;
  /** Every overlay in display order, the shell's three included. */
  overlays: readonly (N | ShellOverlay)[];
  /** Copy for every overlay (a parameter: each game words its own). */
  text: Readonly<Record<N | ShellOverlay, OverlayText>>;
  overlayClasses?: OverlayClasses;
  /** Extra card content per overlay (e.g. a self-pause overlay's buttons). */
  overlayExtra?: (name: N | ShellOverlay) => Node | null | undefined;
  platform?: ShellPlatform;
  /** Copy overrides for the full-screen button and its sheet (default FULLSCREEN_TEXT). */
  fullscreenText?: Partial<FullscreenButtonText>;
  /** Copy overrides for the keep-screen-on hint (default KEEP_AWAKE_TEXT). */
  keepAwakeText?: Partial<KeepAwakeText>;
  /** Labels in the diagnostics report. */
  game?: string;
  version?: string;
  /** Defaults to the page's window / document. */
  window?: Window;
  document?: Document;
}

export interface AppShell<N extends string> {
  readonly screenHost: HTMLElement;
  readonly overlayHost: HTMLElement;
  readonly wakeLock: WakeLock | null;
  /** The corner full-screen button, or null when turned off. */
  readonly fullscreenButton: FullscreenButton | null;
  setOverlay(name: N | ShellOverlay, on: boolean): void;
  /** Active overlays, in display order. */
  overlays(): (N | ShellOverlay)[];
  /** A brief notice at the bottom of the screen (never an error screen). */
  toast(text: string): void;
  destroy(): void;
}

export function createAppShell<N extends string = never>(opts: AppShellOptions<N>): AppShell<N> {
  const { root, client } = opts;
  const win = opts.window ?? window;
  const doc = opts.document ?? document;
  const p = opts.platform ?? {};
  const offs: Array<() => void> = [];

  const wakeLock = p.wakeLock !== false ? createWakeLock() : null;

  const screenHost = el('div', { class: 'screen-host' });
  const overlayHost = el('div', { class: 'overlay-host' });
  root.replaceChildren(...(opts.header ? [opts.header] : []), screenHost, overlayHost);

  // Before the rest of the wiring, so its timeline covers everything that follows.
  if (p.diagnostics ?? diagnosticsEnabled(win.location?.search ?? '')) {
    const diag = createDiagnosticsOverlay({
      root,
      ...(client ? { client } : {}),
      ...(opts.game ? { game: opts.game } : {}),
      ...(opts.version ? { version: opts.version } : {}),
      wakeLock,
      window: win,
      document: doc,
    });
    offs.push(() => diag.destroy());
  }

  const layer: OverlayLayer<N | ShellOverlay> = createOverlayLayer({
    host: overlayHost,
    names: opts.overlays,
    text: opts.text,
    ...(opts.overlayClasses ? { classes: opts.overlayClasses } : {}),
    ...(opts.overlayExtra ? { extra: opts.overlayExtra } : {}),
  });
  const setOverlay = (name: N | ShellOverlay, on: boolean) => layer.set(name, on);

  if (p.fullscreen === true) offs.push(fullscreenOnTap(root, doc));
  if (p.viewport !== false) offs.push(lockViewport(doc));

  if (wakeLock) {
    // Needs a user gesture: take it on the first touch.
    const first = () => void wakeLock.request();
    root.addEventListener('pointerdown', first, { once: true });
    offs.push(() => root.removeEventListener('pointerdown', first));
    if (p.keepAwakeHint !== false) {
      const hint = createKeepAwakeHint({
        host: root,
        wakeLock,
        ...(opts.keepAwakeText ? { text: opts.keepAwakeText } : {}),
      });
      offs.push(() => hint.destroy());
    }
  }

  let fullscreenButton: FullscreenButton | null = null;
  if (p.fullscreenButton !== false) {
    const fsb = createFullscreenButton({
      variant: 'corner',
      corner: p.fullscreenCorner ?? 'top-right',
      landscape: p.landscape !== false,
      overlayHost: root,
      ...(opts.fullscreenText ? { text: opts.fullscreenText } : {}),
      document: doc,
      window: win,
    });
    fullscreenButton = fsb;
    root.append(fsb.element);
    offs.push(() => fsb.destroy());
  }

  if (client) {
    offs.push(
      client.onStatus((s) => setOverlay('reconnecting', s === 'reconnecting')),
      client.onHostStatus((s) => setOverlay('hostAway', s === 'away')),
    );
    if (client.status === 'reconnecting') setOverlay('reconnecting', true);
  }
  if (p.rotate !== false)
    offs.push(watchOrientation((portrait) => setOverlay('rotate', portrait), win));

  return {
    screenHost,
    overlayHost,
    wakeLock,
    fullscreenButton,
    setOverlay,
    overlays: () => layer.active(),
    toast: (text) => void showToast(root, text),
    destroy() {
      for (const off of offs) off();
      wakeLock?.release();
    },
  };
}
