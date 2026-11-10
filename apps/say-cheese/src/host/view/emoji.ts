// TV emoji layer (SPEC §6.6 emoji bullet): reactions float up over the review and results views.
// Self-contained overlay above the view root: its own injected style block, no colors (the glyphs
// carry their own). Painted from the plain-TS feed in host/emoji.
import type { EmojiItem } from '../emoji';

const STYLE_ID = 'sc-emoji-style';
const FLOAT_MS = 3200;

const CSS = `
.emoji-layer{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:50}
.emoji-layer .emoji{position:absolute;bottom:-10vh;font-size:clamp(48px,8vh,96px);line-height:1;
 animation:emoji-float ${FLOAT_MS}ms ease-out forwards;will-change:transform,opacity}
@keyframes emoji-float{0%{transform:translateY(0) scale(.6);opacity:0}
 10%{opacity:1;transform:translateY(-8vh) scale(1)}
 100%{transform:translateY(-95vh) scale(1.1);opacity:0}}
`;

export interface EmojiLayer {
  add(item: EmojiItem): void;
  remove(id: number): void;
  clear(): void;
  destroy(): void;
}

export function mountEmojiLayer(
  parent: HTMLElement,
  opts: { onDone?: (id: number) => void; random?: () => number } = {},
): EmojiLayer {
  const doc = parent.ownerDocument;
  if (!doc.getElementById(STYLE_ID)) {
    const st = doc.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    doc.head.append(st);
  }
  const layer = doc.createElement('div');
  layer.className = 'emoji-layer';
  layer.setAttribute('aria-hidden', 'true');
  parent.append(layer);
  const rnd = opts.random ?? Math.random;
  const nodes = new Map<number, HTMLElement>();
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  function drop(id: number): void {
    nodes.get(id)?.remove();
    nodes.delete(id);
    const t = timers.get(id);
    if (t !== undefined) clearTimeout(t);
    timers.delete(id);
  }

  function clear(): void {
    for (const id of [...nodes.keys()]) drop(id);
  }

  return {
    add(item) {
      const n = doc.createElement('span');
      n.className = 'emoji';
      n.dataset.emoji = String(item.i);
      n.textContent = item.glyph;
      n.style.left = `${5 + rnd() * 85}%`;
      layer.append(n);
      nodes.set(item.id, n);
      timers.set(
        item.id,
        setTimeout(() => {
          drop(item.id);
          opts.onDone?.(item.id);
        }, FLOAT_MS),
      );
    },
    remove: drop,
    clear,
    destroy() {
      clear();
      layer.remove();
    },
  };
}
