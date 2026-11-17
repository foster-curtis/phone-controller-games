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

/** F3 implements. F0 stub: an inert, hidden button. */
export function createFullscreenButton(opts: FullscreenButtonOptions): FullscreenButton {
  const doc = opts.document ?? document;
  const element = doc.createElement('button');
  element.type = 'button';
  element.hidden = true;
  return {
    element,
    mode: 'hidden',
    destroy() {
      element.remove();
    },
  };
}
