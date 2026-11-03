// App shell: lays out `header? + .screen-host + .overlay-host` in the root and turns the phone platform
// on by default (PLATFORM §3): fullscreen on every tap, Wake Lock and the landscape lock on the first
// touch, the locked viewport, the rotate overlay in portrait, and the reconnecting / host-away
// overlays from the client's status. Games mount screens in `screenHost` (see createScreenRouter).
import type { ControllerClient } from '@pcg/net-client';
import { el } from '../dom';
import { fullscreenOnTap } from '../platform/fullscreen';
import { tryLockLandscape, watchOrientation } from '../platform/orientation';
import { lockViewport } from '../platform/viewport';
import { createWakeLock, type WakeLock } from '../platform/wakeLock';
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
  /** Fullscreen on every tap inside the root (default true). */
  fullscreen?: boolean;
  /** Screen Wake Lock, taken on the first touch (default true). */
  wakeLock?: boolean;
  /** Fullscreen + landscape lock on the first touch, where supported (default true). */
  landscape?: boolean;
  /** Rotate overlay while the viewport is portrait (default true). */
  rotate?: boolean;
  /** Locked viewport meta + no pinch zoom (default true). */
  viewport?: boolean;
}

export interface AppShellOptions<N extends string> {
  root: HTMLElement;
  /** Drives the reconnecting / host-away overlays. */
  client?: Pick<ShellClient, 'status' | 'onStatus' | 'onHostStatus'>;
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
  /** Defaults to the page's window / document. */
  window?: Window;
  document?: Document;
}

export interface AppShell<N extends string> {
  readonly screenHost: HTMLElement;
  readonly overlayHost: HTMLElement;
  readonly wakeLock: WakeLock | null;
  setOverlay(name: N | ShellOverlay, on: boolean): void;
  /** Active overlays, in display order. */
  overlays(): (N | ShellOverlay)[];
  destroy(): void;
}

export function createAppShell<N extends string = never>(opts: AppShellOptions<N>): AppShell<N> {
  const { root, client } = opts;
  const win = opts.window ?? window;
  const doc = opts.document ?? document;
  const p = opts.platform ?? {};
  const screenHost = el('div', { class: 'screen-host' });
  const overlayHost = el('div', { class: 'overlay-host' });
  root.replaceChildren(...(opts.header ? [opts.header] : []), screenHost, overlayHost);

  const layer: OverlayLayer<N | ShellOverlay> = createOverlayLayer({
    host: overlayHost,
    names: opts.overlays,
    text: opts.text,
    ...(opts.overlayClasses ? { classes: opts.overlayClasses } : {}),
    ...(opts.overlayExtra ? { extra: opts.overlayExtra } : {}),
  });
  const setOverlay = (name: N | ShellOverlay, on: boolean) => layer.set(name, on);

  const offs: Array<() => void> = [];
  if (p.fullscreen !== false) offs.push(fullscreenOnTap(root, doc));
  if (p.viewport !== false) offs.push(lockViewport(doc));

  const wakeLock = p.wakeLock !== false ? createWakeLock() : null;
  if (wakeLock || p.landscape !== false) {
    // Both need a user gesture: take them on the first touch.
    const first = () => {
      void wakeLock?.request();
      if (p.landscape !== false) void tryLockLandscape(win, doc);
    };
    root.addEventListener('pointerdown', first, { once: true });
    offs.push(() => root.removeEventListener('pointerdown', first));
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
    setOverlay,
    overlays: () => layer.active(),
    destroy() {
      for (const off of offs) off();
      wakeLock?.release();
    },
  };
}
