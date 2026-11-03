// Nearest-center router: a touch on the pads goes to the button whose center is nearer, so buttons
// side by side leave no dead or misassigned area. Capture phase on the container; a press already
// landing on the nearer button's own zone passes through untouched. With no layout (equal distances)
// the zone hit wins. `hitSlop` also catches presses that miss every zone but land within that many px
// of a button's drawn edge (Fort Frenzy SPEC §10.1: targets extend 8 px, nearest center wins).

export interface RoutedPad {
  /** The pad's own touch zone (its listeners handle direct hits). */
  zone: HTMLElement;
  /** The drawn button, whose center decides "nearest". */
  btn: HTMLElement;
  hold: { press(e: PointerEvent): void };
}

export interface NearestRouterOptions {
  /** px beyond each button's rect that still counts as a hit when no zone was hit (default 0). */
  hitSlop?: number;
}

export function createNearestRouter(
  container: HTMLElement,
  pads: RoutedPad[],
  opts: NearestRouterOptions = {},
): () => void {
  const slop = opts.hitSlop ?? 0;
  const center = (b: HTMLElement) => {
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const withinSlop = (b: HTMLElement, x: number, y: number) => {
    const r = b.getBoundingClientRect();
    return x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop;
  };
  const nearest = (candidates: RoutedPad[], x: number, y: number, prefer: RoutedPad | null) => {
    let best: RoutedPad | null = null;
    let bestD = Infinity;
    for (const p of candidates) {
      if (!p.zone.isConnected) continue;
      const c = center(p.btn);
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < bestD - 1e-6 || (Math.abs(d - bestD) <= 1e-6 && p === prefer)) {
        best = p;
        bestD = d;
      }
    }
    return best;
  };
  const onDown = (e: Event) => {
    const pe = e as PointerEvent;
    const own = pads.find((p) => p.zone === pe.target || p.zone.contains(pe.target as Node));
    if (!own) {
      if (slop <= 0) return;
      const hits = pads.filter((p) => withinSlop(p.btn, pe.clientX, pe.clientY));
      const best = nearest(hits, pe.clientX, pe.clientY, null);
      if (!best) return;
      pe.stopPropagation();
      best.hold.press(pe);
      return;
    }
    if (pads.length < 2) return;
    const best = nearest(pads, pe.clientX, pe.clientY, own) ?? own;
    if (best === own) return;
    pe.stopPropagation();
    best.hold.press(pe);
  };
  container.addEventListener('pointerdown', onDown, true);
  return () => container.removeEventListener('pointerdown', onDown, true);
}
