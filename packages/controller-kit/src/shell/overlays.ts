// Phone-local overlays (reconnecting, host away, rotate, plus any the game adds). Copy text and class
// names are parameters; the kit ships no CSS, so the game styles `.overlay` / `.overlay-card` (or its
// own classes) with its brand tokens.
import { el } from '../dom';

export interface OverlayText {
  title: string;
  body: string;
}

export interface OverlayClasses {
  /** Default `overlay`. */
  overlay?: string;
  /** Default `overlay-card`. */
  card?: string;
  /** The `<h1>` title (default none). */
  title?: string;
  /** The `<p>` body (default none). */
  body?: string;
}

export interface OverlayLayerOptions<N extends string> {
  host: HTMLElement;
  /** Every overlay name (also the order `active()` reports them in). */
  names: readonly N[];
  text: Readonly<Record<N, OverlayText>>;
  classes?: OverlayClasses;
  /** Extra content appended to an overlay's card when it opens (e.g. buttons). */
  extra?: (name: N) => Node | null | undefined;
}

export interface OverlayLayer<N extends string> {
  set(name: N, on: boolean): void;
  has(name: N): boolean;
  /** Active overlays, in `names` order. */
  active(): N[];
  destroy(): void;
}

/**
 * Renders `div.overlay[data-overlay=name] > div.overlay-card > h1 + p (+ extra)`. An overlay's element
 * is created when it turns on (appended after those already shown) and removed when it turns off.
 */
export function createOverlayLayer<N extends string>(
  opts: OverlayLayerOptions<N>,
): OverlayLayer<N> {
  const cls = opts.classes ?? {};
  const on = new Set<N>();
  const shown = new Map<N, HTMLElement>();
  const withClass = (c: string | undefined, rest: Record<string, string> = {}) =>
    c ? { class: c, ...rest } : rest;

  const render = (name: N): HTMLElement => {
    const t = opts.text[name];
    const card = el(
      'div',
      { class: cls.card ?? 'overlay-card' },
      el('h1', withClass(cls.title, { text: t.title })),
      el('p', withClass(cls.body, { text: t.body })),
    );
    const extra = opts.extra?.(name);
    if (extra) card.append(extra);
    return el('div', { class: cls.overlay ?? 'overlay', 'data-overlay': name }, card);
  };

  const sync = () => {
    for (const name of opts.names) {
      const present = shown.get(name);
      if (on.has(name) && !present) {
        const o = render(name);
        shown.set(name, o);
        opts.host.append(o);
      } else if (!on.has(name) && present) {
        present.remove();
        shown.delete(name);
      }
    }
  };

  return {
    set(name, value) {
      if (value) on.add(name);
      else on.delete(name);
      sync();
    },
    has: (name) => on.has(name),
    active: () => opts.names.filter((n) => on.has(n)),
    destroy() {
      on.clear();
      sync();
    },
  };
}
