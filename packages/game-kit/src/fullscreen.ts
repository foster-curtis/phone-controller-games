// Host (TV) full-screen button and `F` shortcut (PLATFORM §3; controller-compat F0 contract, F3 builds
// it). Browsers allow full screen only from a real user activation on this page (click, tap, key
// press): gamepad input and messages relayed from a phone don't count, so the TV's button is the only
// way in. Feature-detected through `fullscreenApi`; where the API is missing the button stays hidden.
// Frozen at controller-compat F0: additive changes only.

import { fullscreenApi } from './capabilities';

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

const TOAST_MS = 3_000;

/** Private, tiny toast (game-kit can't import controller-kit). Never throws. */
function toast(parent: HTMLElement, message: string): void {
  try {
    const node = parent.ownerDocument.createElement('div');
    node.className = 'pcg-toast';
    node.setAttribute('role', 'status');
    node.textContent = message;
    Object.assign(node.style, {
      position: 'fixed',
      left: '50%',
      bottom: '16px',
      transform: 'translateX(-50%)',
      zIndex: '1000',
      pointerEvents: 'none',
    });
    parent.append(node);
    setTimeout(() => node.remove(), TOAST_MS);
  } catch {
    /* nothing to show it in */
  }
}

/** Toggles full screen; reports a refusal through `onFail`. Call only from a user-activation handler. */
async function toggleFullscreen(
  doc: Document,
  onFail: (message: string) => void,
): Promise<boolean> {
  const api = fullscreenApi(doc);
  if (!api.supported) return false;
  if (api.isActive()) {
    await api.exit();
    return api.isActive();
  }
  const ok = await api.enter();
  if (!ok) onFail(HOST_FULLSCREEN_FAILED);
  return ok;
}

export function createHostFullscreenButton(
  opts: HostFullscreenButtonOptions,
): HostFullscreenButton {
  const doc = opts.document ?? opts.parent.ownerDocument;
  const label = opts.label ?? HOST_FULLSCREEN_LABEL;
  const exitLabel = opts.exitLabel ?? HOST_EXIT_FULLSCREEN_LABEL;
  const api = fullscreenApi(doc);
  const onFail = opts.onError ?? ((m: string) => toast(opts.parent, m));

  const element = doc.createElement('button');
  element.type = 'button';
  element.className = opts.className ?? 'pcg-fullscreen-btn';
  let visible = true;
  const render = () => {
    element.textContent = api.isActive() ? exitLabel : label;
    element.hidden = !api.supported || !visible;
  };
  render();
  element.addEventListener('click', () => void toggleFullscreen(doc, onFail));
  const offChange = api.onChange(render);
  opts.parent.append(element);
  const offKey =
    opts.shortcut === false
      ? () => {}
      : bindFullscreenShortcut({
          onError: onFail,
          document: doc,
          ...(opts.window ? { window: opts.window } : {}),
        });

  return {
    element,
    supported: api.supported,
    setVisible(v) {
      visible = v;
      render();
    },
    toggle: () => toggleFullscreen(doc, onFail),
    destroy() {
      offChange();
      offKey();
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
 * text field or contenteditable has focus. Returns an unsubscribe.
 */
export function bindFullscreenShortcut(opts: FullscreenShortcutOptions = {}): () => void {
  const doc = opts.document ?? document;
  const target: Pick<Window, 'addEventListener' | 'removeEventListener'> =
    opts.window ?? doc.defaultView ?? window;
  const key = (opts.key ?? 'f').toLowerCase();
  const onFail =
    opts.onError ?? ((m: string) => toast((doc.body ?? doc.documentElement) as HTMLElement, m));
  const onKey = (e: Event) => {
    const k = e as KeyboardEvent;
    if (k.key?.toLowerCase() !== key) return;
    if (k.ctrlKey || k.altKey || k.metaKey || k.repeat) return;
    const t = k.target as HTMLElement | null;
    if (
      t &&
      (/^(input|textarea|select)$/i.test(t.tagName) ||
        t.isContentEditable ||
        t.closest?.('[contenteditable]:not([contenteditable="false"])'))
    )
      return;
    void toggleFullscreen(doc, onFail);
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
