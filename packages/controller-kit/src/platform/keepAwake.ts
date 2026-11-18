// "Keep your screen on" hint (controller-compat F0 contract, F2 builds it). Where Screen Wake Lock is
// missing (Android WebView browsers such as DuckDuckGo, older Firefox, plain-http LAN pages) or its
// request is refused, the phone's screen can dim and lock mid-game, which suspends the page and drops
// its socket. Shows a small dismissible notice (`.pcg-hint`, not blocking play) once per browser
// (remembered in localStorage), after the first touch has had its chance to take the lock.
// Frozen at controller-compat F0: additive changes only.
import type { StorageLike } from '@pcg/net-client';
import { el } from '../dom';
import type { WakeLock } from './wakeLock';

export interface KeepAwakeText {
  title: string;
  body: string;
  dismiss: string;
}

export const KEEP_AWAKE_TEXT: Readonly<KeepAwakeText> = {
  title: 'Keep your screen on',
  body: "This browser can't keep your phone awake. Tap the screen now and then, or set a longer auto-lock while you play.",
  dismiss: 'Got it',
};

/** localStorage key that remembers the hint was shown. */
export const KEEP_AWAKE_SEEN_KEY = 'pcg:hint:keepAwake';

export interface KeepAwakeHintOptions {
  host: HTMLElement;
  /** The shell's lock; null = Wake Lock turned off by the game (then the hint never shows). */
  wakeLock: WakeLock | null;
  text?: Partial<KeepAwakeText>;
  /** Default localStorage (failures swallowed: the hint may then show again next visit). */
  storage?: StorageLike;
}

export interface KeepAwakeHint {
  destroy(): void;
}

/** How long after the first touch the lock gets to be taken before the hint decides it isn't coming. */
const GRACE_MS = 1000;

/** How long the hint stays up before hiding itself (dismiss works earlier). */
export const KEEP_AWAKE_HINT_MS = 8000;

export function createKeepAwakeHint(opts: KeepAwakeHintOptions): KeepAwakeHint {
  const { host, wakeLock } = opts;
  const text = { ...KEEP_AWAKE_TEXT, ...opts.text };
  let storage: StorageLike | undefined;
  try {
    storage = opts.storage ?? globalThis.localStorage;
  } catch {
    storage = undefined;
  }
  let node: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const seen = (): boolean => {
    try {
      return storage?.getItem(KEEP_AWAKE_SEEN_KEY) != null;
    } catch {
      return false;
    }
  };
  const markSeen = () => {
    try {
      storage?.setItem(KEEP_AWAKE_SEEN_KEY, '1');
    } catch {
      /* may show again next visit */
    }
  };

  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  const hide = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    node?.remove();
    node = null;
  };

  const show = () => {
    if (destroyed || node) return;
    const dismiss = el('button', { type: 'button', class: 'pcg-hint-dismiss', text: text.dismiss });
    dismiss.addEventListener('click', hide);
    dismiss.style.pointerEvents = 'auto';
    node = el(
      'div',
      { class: 'pcg-hint', role: 'status' },
      el('div', { class: 'pcg-hint-title', text: text.title }),
      el('div', { class: 'pcg-hint-body', text: text.body }),
      dismiss,
    );
    // Layout only; the game styles the look. Taps pass through the notice (only the dismiss button takes them), so the controls stay live.
    Object.assign(node.style, {
      position: 'fixed',
      top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
      left: '50%',
      transform: 'translateX(-50%)',
      maxWidth: 'min(92vw, 28rem)',
      zIndex: '2147483000',
      pointerEvents: 'none',
    });
    host.append(node);
    hideTimer = setTimeout(hide, KEEP_AWAKE_HINT_MS);
    markSeen();
  };

  const onFirstTouch = () => {
    if (destroyed || !wakeLock || seen()) return;
    try {
      if (!wakeLock.supported) return show();
      timer = setTimeout(() => {
        timer = null;
        if (!wakeLock.held) show();
      }, GRACE_MS);
    } catch {
      /* never throws */
    }
  };

  if (wakeLock && !seen()) host.addEventListener('pointerdown', onFirstTouch, { once: true });

  return {
    destroy() {
      destroyed = true;
      host.removeEventListener('pointerdown', onFirstTouch);
      if (timer) clearTimeout(timer);
      timer = null;
      hide();
    },
  };
}
