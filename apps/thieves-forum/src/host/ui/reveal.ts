// Reveal cards (SPEC §6.14): lowest haul to highest, a card pops above each player (bag, item icons with
// values, amber coin-edge strip with this round's haul only), then shrinks to a small "+haul" tag as
// the next card opens. Positions are 1920 x 1080 screen coordinates the scene provides (`TvAnchors`);
// without an anchor the cards line up in a row. No match totals here (podium only). Animation: TF18.
import type { RevealEntry, RevealView } from '../sim/snapshot';
import { h } from './dom';
import { itemIconUrl, itemName } from './icons';
import type { TvAnchors } from './types';

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** Card state for the entry at `index` after `step` cards have popped. */
export function cardState(index: number, step: number): 'hidden' | 'open' | 'tag' {
  if (index >= step) return 'hidden';
  return index === step - 1 ? 'open' : 'tag';
}

function fmt(n: number): string {
  return String(Math.round(n));
}

/** A haul with its sign: "+12", or "−5" for a round that lost money (SPEC §6.4 hauls may be negative). */
const signed = (n: number): string => (Math.round(n) < 0 ? `−${fmt(-n)}` : `+${fmt(n)}`);

/** One reveal card (also used on its own by `?ui=reveal` fixtures and tests). */
export function createRevealCard(entry: RevealEntry): HTMLElement {
  const card = h('article', 'reveal-card');
  card.dataset.role = 'reveal-card';
  card.dataset.color = entry.color;
  if (entry.top) card.dataset.top = '';

  const name = h('h3', 'reveal-name name-tv', entry.name);

  const bag = h('div', 'reveal-bag');
  bag.append(h('span', 'caption', 'Bag'), h('span', 'money', fmt(entry.bag)));

  const items = h('ul', 'reveal-items');
  for (const it of entry.items) {
    const li = h('li', 'reveal-item');
    const url = itemIconUrl(it.item);
    if (url) {
      const img = h('img', 'reveal-icon');
      img.src = url;
      img.alt = itemName(it.item);
      li.append(img);
    } else {
      li.append(h('span', 'caption', itemName(it.item)));
    }
    li.append(h('span', 'money', fmt(it.value)));
    items.append(li);
  }
  if (entry.items.length === 0) items.append(h('li', 'caption reveal-none', 'No items'));

  const strip = h('div', 'reveal-haul coin-edge');
  strip.dataset.role = 'haul';
  strip.append(h('span', 'money', signed(entry.haul)));

  const tag = h('div', 'reveal-tag money');
  tag.dataset.role = 'haul-tag';
  tag.textContent = signed(entry.haul);

  card.append(name, bag, items, strip, tag);
  return card;
}

export interface RevealLayer {
  readonly el: HTMLElement;
  update(view: RevealView, step: number): void;
  setAnchors(anchors: TvAnchors): void;
}

export function createRevealLayer(): RevealLayer {
  const el = h('div', 'reveal-layer');
  let anchors: TvAnchors = {};
  let last: { view: RevealView; step: number } | null = null;
  let cards: { entry: RevealEntry; card: HTMLElement }[] = [];
  let shown: RevealView | null = null;

  const place = (): void => {
    if (!last) return;
    const n = last.view.entries.length;
    cards.forEach(({ entry, card }, i) => {
      const a = anchors[entry.character];
      const x = a?.x ?? ((i + 1) / (n + 1)) * STAGE_W;
      const y = a?.y ?? STAGE_H * 0.6;
      card.style.left = `${(x / STAGE_W) * 100}%`;
      card.style.top = `${(y / STAGE_H) * 100}%`;
      card.dataset.state = cardState(i, last!.step);
      card.hidden = card.dataset.state === 'hidden';
    });
  };

  return {
    el,
    update(view, step) {
      last = { view, step };
      if (shown !== view) {
        shown = view;
        cards = view.entries.map((entry) => ({ entry, card: createRevealCard(entry) }));
        el.replaceChildren(...cards.map((c) => c.card));
        el.dataset.round = String(view.round);
      }
      place();
    },
    setAnchors(a) {
      anchors = a;
      place();
    },
  };
}
