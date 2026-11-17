// Brief, non-blocking phone notices (controller-compat F0): a refused full-screen request, the
// keep-screen-on hint. Never an error screen. The kit sets layout only (position, stacking); the game
// styles `.pcg-toast` with its brand tokens.
import { el } from '../dom';

export const TOAST_MS = 3_000;

export interface ToastOptions {
  /** How long it stays. Default TOAST_MS. 0 = until dismissed. */
  ms?: number;
  /** Default `pcg-toast`. */
  className?: string;
}

/** Shows `text` at the bottom centre of `host`; returns a dismiss function. Never throws. */
export function showToast(host: HTMLElement, text: string, opts: ToastOptions = {}): () => void {
  let node: HTMLElement | null = null;
  try {
    node = el('div', { class: opts.className ?? 'pcg-toast', role: 'status', text });
    Object.assign(node.style, {
      position: 'fixed',
      left: '50%',
      bottom: 'max(16px, env(safe-area-inset-bottom))',
      transform: 'translateX(-50%)',
      zIndex: '1000',
      maxWidth: 'min(90vw, 420px)',
      pointerEvents: 'none',
    });
    host.append(node);
  } catch {
    return () => {};
  }
  const ms = opts.ms ?? TOAST_MS;
  const timer = ms > 0 ? setTimeout(() => dismiss(), ms) : null;
  function dismiss() {
    if (timer !== null) clearTimeout(timer);
    node?.remove();
    node = null;
  }
  return dismiss;
}
