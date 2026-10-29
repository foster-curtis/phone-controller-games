// Viewport and touch setup (PLATFORM §3: `touch-action: none`, locked viewport) plus safe-area helpers
// for layouts that must stay clear of notches and home indicators.

/** The locked phone viewport: no zoom, edge to edge (safe areas via `env(safe-area-inset-*)`). */
export const LOCKED_VIEWPORT =
  'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

/**
 * Ensures `<meta name="viewport">` carries LOCKED_VIEWPORT and blocks iOS pinch zoom (Safari ignores
 * `user-scalable=no`). Returns an unsubscribe for the gesture listener.
 */
export function lockViewport(doc: Document = document): () => void {
  let meta = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = doc.createElement('meta');
    meta.name = 'viewport';
    doc.head.append(meta);
  }
  if (meta.content !== LOCKED_VIEWPORT) meta.content = LOCKED_VIEWPORT;
  const block = (e: Event) => e.preventDefault();
  doc.addEventListener('gesturestart', block);
  return () => doc.removeEventListener('gesturestart', block);
}

/** Sets `touch-action` on a control surface (default `none`: no scroll, zoom or double-tap delay). */
export function setTouchAction(el: HTMLElement, value: string = 'none'): void {
  el.style.touchAction = value;
}

export type SafeSide = 'top' | 'right' | 'bottom' | 'left';

export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const SIDES: readonly SafeSide[] = ['top', 'right', 'bottom', 'left'];

/** CSS for "at least `min`, more where the device needs it": `max(min, env(safe-area-inset-side))`. */
export function safePad(side: SafeSide, min: string = '0px'): string {
  return `max(${min}, env(safe-area-inset-${side}))`;
}

/**
 * The current safe-area insets in CSS px, measured with a hidden probe padded by
 * `env(safe-area-inset-*)`. All zeros where unsupported (desktop, jsdom).
 */
export function readSafeInsets(doc: Document = document): SafeInsets {
  const probe = doc.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    SIDES.map((s) => `padding-${s}:env(safe-area-inset-${s})`).join(';');
  doc.body.append(probe);
  const cs = doc.defaultView?.getComputedStyle(probe);
  const px = (s: SafeSide) => {
    const n = parseFloat(cs?.getPropertyValue(`padding-${s}`) ?? '');
    return Number.isFinite(n) ? n : 0;
  };
  const insets = { top: px('top'), right: px('right'), bottom: px('bottom'), left: px('left') };
  probe.remove();
  return insets;
}
