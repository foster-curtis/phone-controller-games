// Host (TV) full-screen button and `F` shortcut (PLATFORM §3; controller-compat F0 contract, F3 builds
// it). Browsers allow full screen only from a real user activation on this page (click, tap, key
// press): gamepad input and messages relayed from a phone don't count, so the TV's button is the only
// way in. Feature-detected through `fullscreenApi`; where the API is missing the button stays hidden.
// Frozen at controller-compat F0: additive changes only.

export const HOST_FULLSCREEN_LABEL = 'Full screen';
export const HOST_EXIT_FULLSCREEN_LABEL = 'Exit full screen';
export const HOST_FULLSCREEN_FAILED =
  "Couldn't go full screen. Try your browser's full-screen key.";

export interface HostFullscreenButtonOptions {
  /** Where the button is mounted (the lobby or pause screen's DOM layer). */
  parent: HTMLElement;
  /** Default HOST_FULLSCREEN_LABEL / HOST_EXIT_FULLSCREEN_LABEL. */
  label?: string;
  exitLabel?: string;
  /** Also bind the `F` key (default true). See `bindFullscreenShortcut`. */
  shortcut?: boolean;
  /** Class hook for the game's styling (default `pcg-fullscreen-btn`). The kit ships no look. */
  className?: string;
  /**
   * A refused request (never an error screen). Default: a short toast (`.pcg-toast`) in `parent` for
   * about 3 s.
   */
  onError?: (message: string) => void;
  document?: Document;
  window?: Window;
}

export interface HostFullscreenButton {
  /** A real `<button>`: focusable and keyboard-activated, no hover needed. */
  readonly element: HTMLButtonElement;
  /** False where the Fullscreen API is missing: the button never shows. */
  readonly supported: boolean;
  /**
   * Show it on the lobby and pause/menu screens, hide it during play so it never covers the play
   * area. The `F` shortcut works either way.
   */
  setVisible(visible: boolean): void;
  /** Enter or exit. Resolves true when the page is full screen afterwards. */
  toggle(): Promise<boolean>;
  destroy(): void;
}

/** F3 implements. F0 stub: an inert, hidden button. */
export function createHostFullscreenButton(
  opts: HostFullscreenButtonOptions,
): HostFullscreenButton {
  const doc = opts.document ?? opts.parent.ownerDocument;
  const element = doc.createElement('button');
  element.type = 'button';
  element.hidden = true;
  return {
    element,
    supported: false,
    setVisible() {},
    toggle: () => Promise.resolve(false),
    destroy() {
      element.remove();
    },
  };
}

export interface FullscreenShortcutOptions {
  /** Default `f` (either case). */
  key?: string;
  onError?: (message: string) => void;
  document?: Document;
  window?: Window;
}

/**
 * `F` toggles full screen on the TV: ignored with Ctrl / Alt / Meta held, on key repeat, and while a
 * text field or contenteditable has focus. Returns an unsubscribe. F3 implements; F0 stub: no-op.
 */
export function bindFullscreenShortcut(_opts: FullscreenShortcutOptions = {}): () => void {
  return () => {};
}
