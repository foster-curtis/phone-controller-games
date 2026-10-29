// Shared screen plumbing: the view contract, the context every screen gets, keyed list
// reconciliation (so a held shop button or a scroll position survives a snapshot), the player tag,
// room code boxes, the build-phase countdown and the on-screen keyboard fit.
import { el, type RoutedView } from '@pcg/controller-kit';
import type { StorageLike } from '@pcg/net-client';
import type { Intent, MeView, TeamView } from '../../shared/messages';
import { colorOnVar, colorVar } from '../components';
import type { PhoneSender } from '../input';

export interface Snapshot {
  team: TeamView;
  me: MeView;
}

export type View = RoutedView<Snapshot>;

export interface ScreenCtx {
  intent(i: Intent): void;
  sender: PhoneSender;
  code: string | null;
  storage: StorageLike | undefined;
  /** This phone's relay player id (matches `roster[].playerId` and `wishlist[].by`). */
  myId(): string | null;
  toast(text: string): void;
  /** Local-only copy of "now" so tests and dev can freeze it. */
  now(): number;
}

export interface KeyedItem {
  key: string;
  /** Changes whenever the item must be rebuilt. */
  sig: string;
  make(): { el: HTMLElement; destroy?(): void };
}

/** Keeps nodes whose key and signature are unchanged; rebuilds the rest; removes the gone. */
export function createKeyedList(host: HTMLElement) {
  const live = new Map<
    string,
    { sig: string; el: HTMLElement; destroy?: (() => void) | undefined }
  >();
  return {
    set(items: readonly KeyedItem[]): void {
      const next = new Map<
        string,
        { sig: string; el: HTMLElement; destroy?: (() => void) | undefined }
      >();
      const order: HTMLElement[] = [];
      for (const it of items) {
        const prev = live.get(it.key);
        if (prev && prev.sig === it.sig) {
          next.set(it.key, prev);
          order.push(prev.el);
          continue;
        }
        prev?.destroy?.();
        const made = it.make();
        next.set(it.key, { sig: it.sig, el: made.el, destroy: made.destroy });
        order.push(made.el);
      }
      for (const [k, v] of live) if (!next.has(k)) v.destroy?.();
      live.clear();
      for (const [k, v] of next) live.set(k, v);
      // Reorder only when needed, so a touched node isn't re-inserted mid-gesture.
      const same =
        host.children.length === order.length && order.every((n, i) => host.children[i] === n);
      if (!same) host.replaceChildren(...order);
    },
    destroy(): void {
      for (const v of live.values()) v.destroy?.();
      live.clear();
    },
  };
}

/** The player's name on a chamfered tag in their color (top-left). */
export function playerTag(): { el: HTMLElement; set(me: MeView): void } {
  const node = el('div', { class: 'player-tag tag' });
  return {
    el: node,
    set(me) {
      node.textContent = me.name || 'Player';
      node.style.setProperty('--tag-bg', colorVar(me.color));
      node.style.setProperty('--tag-on', colorOnVar(me.color));
      node.hidden = !me.name;
    },
  };
}

/** Room code in chamfered boxes (the join mockup). */
export function codeBoxes(code: string): HTMLElement {
  return el(
    'div',
    { class: 'code-boxes', 'aria-label': `Room code ${code}` },
    ...[...code].map((ch) => el('span', { class: 'code-box code-glyph', text: ch })),
  );
}

export const formatClock = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * A text that counts down toward a deadline. `set(ms)` re-anchors it (null hides it); it repaints
 * every 250 ms until destroyed.
 */
export function createCountdown(
  node: HTMLElement,
  render: (remainingMs: number) => string,
  now: () => number,
): { set(ms: number | null): void; destroy(): void } {
  let endsAt: number | null = null;
  const paint = () => {
    node.hidden = endsAt === null;
    if (endsAt !== null) node.textContent = render(Math.max(0, endsAt - now()));
  };
  const timer = setInterval(paint, 250);
  return {
    set(ms) {
      endsAt = ms === null ? null : now() + ms;
      paint();
    },
    destroy: () => clearInterval(timer),
  };
}

// ---- on-screen keyboard (Sunny Side's visual-viewport approach, kept local: extraction candidate) ----

const KEYBOARD_MIN_PX = 80;
const tallest = new Map<number, number>();

interface ViewportLike {
  width: number;
  height: number;
  offsetTop: number;
  addEventListener(type: 'resize' | 'scroll', cb: () => void): void;
  removeEventListener(type: 'resize' | 'scroll', cb: () => void): void;
}

/** While the keyboard is up, `container` gets `kb-open` and `--vv-top` / `--vv-h` (its visible area). */
export function fitAboveKeyboard(
  container: HTMLElement,
  vv: ViewportLike | null = (globalThis as { visualViewport?: ViewportLike | null })
    .visualViewport ?? null,
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
