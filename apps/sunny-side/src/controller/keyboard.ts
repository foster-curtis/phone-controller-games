// On-screen keyboard handling for the name forms. The page is a fixed, non-scrolling layout, so the
// browser can't scroll a focused input into view: the keyboard just covers it. While the keyboard
// is up (the visual viewport is clearly shorter than it was at this width), `container` gets
// `kb-open` and is pinned to the visible area via --vv-top / --vv-h; the CSS then lays the input
// and its buttons out as one compact row at the top.

/** The visual viewport must shrink by at least this much (px) to count as "keyboard open". */
const KEYBOARD_MIN_PX = 80;

/** Tallest visual viewport seen per viewport width (rotation changes the width; a keyboard doesn't). */
const tallest = new Map<number, number>();

export interface ViewportLike {
  width: number;
  height: number;
  offsetTop: number;
  addEventListener(type: 'resize' | 'scroll', cb: () => void): void;
  removeEventListener(type: 'resize' | 'scroll', cb: () => void): void;
}

function defaultViewport(): ViewportLike | null {
  return (globalThis as { visualViewport?: ViewportLike | null }).visualViewport ?? null;
}

/** Starts tracking; returns a stop function (also removes `kb-open`). No-op without visualViewport. */
export function fitAboveKeyboard(
  container: HTMLElement,
  vv: ViewportLike | null = defaultViewport(),
): () => void {
  if (!vv) return () => {};
  const update = () => {
    const width = Math.round(vv.width);
    const max = Math.max(tallest.get(width) ?? 0, vv.height);
    tallest.set(width, max);
    const open = max - vv.height >= KEYBOARD_MIN_PX;
    container.classList.toggle('kb-open', open);
    if (open) {
      container.style.setProperty('--vv-top', `${vv.offsetTop}px`);
      container.style.setProperty('--vv-h', `${vv.height}px`);
    } else {
      container.style.removeProperty('--vv-top');
      container.style.removeProperty('--vv-h');
    }
  };
  update();
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
    container.classList.remove('kb-open');
  };
}

/** Test hook: forget the tallest heights seen. */
export function resetKeyboardBaseline(): void {
  tallest.clear();
}
