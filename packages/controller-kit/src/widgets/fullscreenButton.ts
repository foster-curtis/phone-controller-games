// Manual full-screen button for phones (PLATFORM §3; controller-compat F0 contract, F3 builds it).
// Replaces automatic full screen on tap. Two variants share one behavior:
//   - `inline`: a labelled button the game mounts in its lobby / join screen.
//   - `corner`: a small icon the app shell pins to a screen corner during play, away from the
//     joystick and action buttons. It reacts only to a tap that starts and ends on it, so a thumb
//     sliding in from a control can't trigger it.
// Behavior (feature-detected through `fullscreenApi` from @pcg/game-kit, never the user agent):
//   - Hidden while the page is full screen or running as an installed web app (`isStandalone`); shown
//     again when full screen ends (exit gesture, reload, reconnect).
//   - Fullscreen API available: tap enters full screen, then (when `landscape`) tries the landscape
//     lock. A refused request shows a toast (`text.failed`), never an error screen.
//   - API missing (iPhone and every iOS browser, WebViews without full-screen support): the tap opens
//     the Add-to-Home-Screen sheet instead (`openInstallSheet`).
// The kit sets layout only (position, size ≥ 44 px, stacking, safe-area insets); the game styles the
// class hooks with its brand tokens.
// Frozen at controller-compat F0: additive changes only.

import { fullscreenApi, isStandalone, type CapabilityEnv } from '@pcg/game-kit';
import { openInstallSheet } from '../shell/installSheet';
import { showToast } from '../platform/toast';

export type FullscreenCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface FullscreenButtonText {
  /** Inline label and corner `aria-label`. */
  enter: string;
  /** Sheet heading. */
  sheetTitle: string;
  /** Sheet body where `navigator.standalone` exists (iOS: the Share menu). */
  sheetBodyShare: string;
  /** Sheet body elsewhere (the browser menu). */
  sheetBodyMenu: string;
  sheetClose: string;
  /** Toast after a refused request. */
  failed: string;
}

export const FULLSCREEN_TEXT: Readonly<FullscreenButtonText> = {
  enter: 'Full screen',
  sheetTitle: 'Full screen',
  sheetBodyShare:
    'For full screen, tap Share → Add to Home Screen, then open the game from your home screen.',
  sheetBodyMenu:
    "This browser can't go full screen. Open its menu → Add to Home screen, then open the game from your home screen.",
  sheetClose: 'Got it',
  failed: "Couldn't go full screen.",
};

export interface FullscreenButtonOptions {
  variant: 'inline' | 'corner';
  /** Corner variant only. Default `top-right`. */
  corner?: FullscreenCorner;
  /** Try the landscape lock after entering full screen (default false; the shell passes its own). */
  landscape?: boolean;
  text?: Partial<FullscreenButtonText>;
  /** Where the sheet and toasts mount. Default `document.body`. */
  overlayHost?: HTMLElement;
  /** Class hook. Default `pcg-fullscreen-btn` (plus `pcg-fullscreen-corner` for the corner variant). */
  className?: string;
  document?: Document;
  window?: Window;
}

export interface FullscreenButton {
  readonly element: HTMLButtonElement;
  /** `toggle`: the API works here; `install-sheet`: the tap opens the sheet; `hidden`: full screen or installed. */
  readonly mode: 'toggle' | 'install-sheet' | 'hidden';
  destroy(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_SIZE = '44px';

function icon(doc: Document): SVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

function cornerStyle(corner: FullscreenCorner): Record<string, string> {
  const [v, h] = corner.split('-') as ['top' | 'bottom', 'left' | 'right'];
  return {
    position: 'fixed',
    [v]: `max(8px, env(safe-area-inset-${v}))`,
    [h]: `max(8px, env(safe-area-inset-${h}))`,
    zIndex: '1500',
  };
}

export function createFullscreenButton(opts: FullscreenButtonOptions): FullscreenButton {
  const doc = opts.document ?? document;
  const win = opts.window ?? window;
  const text: FullscreenButtonText = { ...FULLSCREEN_TEXT, ...opts.text };
  const overlayHost = opts.overlayHost ?? doc.body;
  const api = fullscreenApi(doc);
  const corner = opts.variant === 'corner';

  const element = doc.createElement('button');
  element.type = 'button';
  element.className =
    opts.className ?? (corner ? 'pcg-fullscreen-btn pcg-fullscreen-corner' : 'pcg-fullscreen-btn');
  if (corner) {
    element.setAttribute('aria-label', text.enter);
    element.append(icon(doc));
    Object.assign(element.style, {
      ...cornerStyle(opts.corner ?? 'top-right'),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: MIN_SIZE,
      minHeight: MIN_SIZE,
      padding: '0',
      touchAction: 'manipulation',
    });
  } else {
    element.textContent = text.enter;
    element.style.minHeight = MIN_SIZE;
  }

  const evaluate = (): FullscreenButton['mode'] =>
    api.isActive() ||
    isStandalone({ window: win as unknown as CapabilityEnv['window'], navigator: win.navigator })
      ? 'hidden'
      : api.supported
        ? 'toggle'
        : 'install-sheet';

  let mode = evaluate();
  const apply = () => {
    mode = evaluate();
    element.hidden = mode === 'hidden';
    if (corner) element.style.display = mode === 'hidden' ? 'none' : 'flex';
    else element.style.display = mode === 'hidden' ? 'none' : '';
  };
  apply();

  const offs: Array<() => void> = [api.onChange(apply)];
  // Display-mode changes (install, or leaving the installed app).
  for (const q of ['(display-mode: fullscreen)', '(display-mode: standalone)']) {
    try {
      const mql = win.matchMedia?.(q);
      if (mql && typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', apply);
        offs.push(() => mql.removeEventListener('change', apply));
      }
    } catch {
      /* no matchMedia */
    }
  }

  // Deliberate tap: pointerdown and click must both land on this button.
  let armed = false;
  const clearArmed = () => {
    armed = false;
  };
  doc.addEventListener('pointerdown', clearArmed, true);
  offs.push(() => doc.removeEventListener('pointerdown', clearArmed, true));
  element.addEventListener('pointerdown', () => {
    armed = true;
  });
  element.addEventListener('pointercancel', clearArmed);

  const activate = async () => {
    apply();
    if (mode === 'install-sheet') {
      const nav = win.navigator as Navigator & { standalone?: boolean };
      openInstallSheet(overlayHost, {
        title: text.sheetTitle,
        body: 'standalone' in nav ? text.sheetBodyShare : text.sheetBodyMenu,
        close: text.sheetClose,
      });
      return;
    }
    if (mode !== 'toggle') return;
    const ok = await api.enter();
    if (!ok) {
      showToast(overlayHost, text.failed);
      return;
    }
    if (opts.landscape) {
      try {
        const o = win.screen?.orientation as
          (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
        await o?.lock?.('landscape');
      } catch {
        /* lock refused or unsupported */
      }
    }
  };
  element.addEventListener('click', (e) => {
    // detail 0 = keyboard Enter/Space (or script); otherwise the press must have started here.
    const deliberate = armed || e.detail === 0;
    armed = false;
    if (deliberate) void activate();
  });

  return {
    element,
    get mode() {
      return mode;
    },
    destroy() {
      for (const off of offs) off();
      element.remove();
    },
  };
}
