// One-card swipe for class select (FF4-fix-2, C1 note 2): a swipe of any length moves exactly one card
// (never a fling through the whole row). Native scroll-snap lets momentum carry past cards, so the
// strip is moved by transform and the release decides the target index.

/** Drag distance that counts as a swipe, px (or 12% of the card width if smaller). */
export const SWIPE_MIN_PX = 36;
/** A shorter flick still counts when it is this fast, px per ms. */
export const SWIPE_MIN_SPEED = 0.35;
/** Smallest movement a flick needs, px. */
export const FLICK_MIN_PX = 12;

/** The card to land on after a drag of `dx` px over `dtMs`: at most one place from `index`. */
export function swipeTarget(
  index: number,
  count: number,
  dx: number,
  dtMs: number,
  width: number,
): number {
  const dist = Math.abs(dx);
  const far = dist >= Math.min(SWIPE_MIN_PX, width * 0.12);
  const flick = dist >= FLICK_MIN_PX && dist / Math.max(1, dtMs) >= SWIPE_MIN_SPEED;
  if (!far && !flick) return index;
  const next = index + (dx < 0 ? 1 : -1);
  return Math.max(0, Math.min(count - 1, next));
}

export interface Swipe {
  setIndex(i: number, animate?: boolean): void;
  index(): number;
  destroy(): void;
}

/** Binds pointer swipes on `viewport`, moving `strip` by transform. `onIndex` fires on a change. */
export function bindSwipe(
  viewport: HTMLElement,
  strip: HTMLElement,
  opts: { count(): number; onIndex(i: number): void; now?: () => number },
): Swipe {
  const now = opts.now ?? (() => Date.now());
  let index = 0;
  let down: { id: number; x: number; t: number } | null = null;

  /** Card pitch (width + gap), px; 0 before layout. */
  const pitch = () => {
    const a = strip.children[0] as HTMLElement | undefined;
    const b = strip.children[1] as HTMLElement | undefined;
    return a && b ? b.offsetLeft - a.offsetLeft : (a?.offsetWidth ?? 0);
  };
  const place = (extra = 0) => {
    strip.style.transform = `translateX(${-index * pitch() + extra}px)`;
  };
  const animate = (on: boolean) => {
    strip.classList.toggle('dragging', !on);
  };

  const setIndex = (i: number, anim = true) => {
    const next = Math.max(0, Math.min(Math.max(0, opts.count() - 1), i));
    animate(anim);
    const changed = next !== index;
    index = next;
    place();
    if (changed) opts.onIndex(index);
  };

  const onDown = (e: PointerEvent) => {
    if (down) return;
    down = { id: e.pointerId, x: e.clientX, t: now() };
    try {
      viewport.setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer already gone */
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id) return;
    let dx = e.clientX - down.x;
    // Rubber band at the ends, and never drag more than one card.
    const p = pitch();
    if ((index === 0 && dx > 0) || (index === opts.count() - 1 && dx < 0)) dx *= 0.3;
    if (p > 0) dx = Math.max(-p, Math.min(p, dx));
    animate(false);
    place(dx);
  };
  const finish = (e: PointerEvent, cancelled: boolean) => {
    if (!down || e.pointerId !== down.id) return;
    const d = down;
    down = null;
    const dx = e.clientX - d.x;
    const next = cancelled
      ? index
      : swipeTarget(index, opts.count(), dx, now() - d.t, viewport.clientWidth);
    setIndex(next);
  };
  const onUp = (e: PointerEvent) => finish(e, false);
  const onCancel = (e: PointerEvent) => finish(e, true);

  viewport.addEventListener('pointerdown', onDown);
  viewport.addEventListener('pointermove', onMove);
  viewport.addEventListener('pointerup', onUp);
  viewport.addEventListener('pointercancel', onCancel);
  const onResize = () => {
    animate(false);
    place();
  };
  window.addEventListener('resize', onResize);

  return {
    setIndex,
    index: () => index,
    destroy() {
      viewport.removeEventListener('pointerdown', onDown);
      viewport.removeEventListener('pointermove', onMove);
      viewport.removeEventListener('pointerup', onUp);
      viewport.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('resize', onResize);
    },
  };
}
