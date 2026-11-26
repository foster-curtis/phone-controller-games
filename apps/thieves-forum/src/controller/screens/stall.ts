// Stall view (SPEC §6.7, §6.17): private, over the play screen with the joystick still live. Canopy
// header, "Counter · hold to grab" and dimmed "Back shelf · out of reach" tile rows, rarity borders,
// "Too heavy" / "Taken", a hold bar per tile from the injected HoldEstimator. Tiles update in place
// (keyed by slot) so a held tile keeps its pointer while the host changes other tiles.
// Never imports host code.
import { createHoldButton, type HoldButton } from '@pcg/controller-kit';
import type { StallView, StallViewItem } from '../../shared/viewer/types';
import type { Ctx } from '../ctx';
import { holdPct, pressHold, releaseHold } from '../holds';
import { el, itemIcon, money } from '../ui';

interface Entry {
  el: HTMLElement;
  bar: HTMLElement;
  fill: HTMLElement;
  note: HTMLElement;
  hb: HoldButton;
  item: StallViewItem;
  sig: string;
}

export interface StallPane {
  el: HTMLElement;
  update(view: StallView): void;
  tick(now: number): void;
  destroy(): void;
}

const NOTE: Partial<Record<StallViewItem['state'], string>> = {
  tooHeavy: 'Too heavy',
  takenByOther: 'Taken',
};

export function createStallPane(ctx: Ctx, first: StallView): StallPane {
  const head = el('header', { class: 'stall-head' });
  const counter = el('div', { class: 'tiles counter' });
  const shelf = el('div', { class: 'tiles shelf' });
  const shelfLabel = el('p', { class: 'row-label caption' });
  const root = el(
    'section',
    { class: 'pane stall', 'data-sheet': 'stall' },
    head,
    el('p', { class: 'row-label caption', text: 'Counter · hold to grab' }),
    counter,
    shelfLabel,
    shelf,
  );
  const entries = new Map<number, Entry>();
  let stallId = first.stall;

  const make = (item: StallViewItem): Entry => {
    const fill = el('i');
    const bar = el('span', { class: 'hold-bar', hidden: '' }, fill);
    const note = el('span', { class: 'note' });
    const tile = el(
      'button',
      { type: 'button', class: 'tile', 'data-slot': String(item.slot) },
      itemIcon(item.item),
      el('span', { class: 'name', text: item.name }),
      el('span', { class: 'price money', text: money(item.price) }),
      note,
      bar,
    );
    const entry: Entry = { el: tile, bar, fill, note, item, sig: '', hb: null as never };
    entry.hb = createHoldButton(tile, (down) => {
      if (!down) return releaseHold(ctx);
      if (entry.item.state !== 'free') return;
      ctx.send({ t: 'grab', stall: stallId, slot: entry.item.slot });
      pressHold(ctx, 'grab', entry.item.slot);
    });
    return entry;
  };

  const sync = (row: HTMLElement, items: StallViewItem[]) => {
    const want: HTMLElement[] = [];
    for (const item of items) {
      let e = entries.get(item.slot);
      if (!e) entries.set(item.slot, (e = make(item)));
      e.item = item;
      const sig = `${item.state}|${item.rarity}|${item.price}|${item.name}`;
      if (sig !== e.sig) {
        e.sig = sig;
        e.el.dataset.state = item.state;
        e.el.dataset.rarity = item.rarity;
        e.el.classList.toggle('dim', item.state === 'outOfReach');
        e.el.setAttribute('aria-disabled', String(item.state !== 'free'));
        e.note.textContent = NOTE[item.state] ?? '';
      }
      want.push(e.el);
    }
    // Reorder only on a real change: re-appending a pressed tile would drop its pointer capture.
    const have = [...row.children];
    if (want.length !== have.length || want.some((n, i) => n !== have[i]))
      row.replaceChildren(...want);
  };

  const render = (v: StallView) => {
    stallId = v.stall;
    head.textContent = v.title;
    head.dataset.canopy = v.canopy;
    head.style.background = `var(--canopy-${v.canopy})`;
    sync(counter, v.counter);
    sync(shelf, v.shelf);
    const live = new Set([...v.counter, ...v.shelf].map((i) => i.slot));
    for (const [slot, e] of entries)
      if (!live.has(slot)) {
        e.hb.destroy();
        e.el.remove();
        entries.delete(slot);
      }
    const out = v.shelf.length > 0 && v.shelf.every((i) => i.state === 'outOfReach');
    shelf.classList.toggle('dim', out);
    shelfLabel.textContent = out ? 'Back shelf · out of reach' : 'Back shelf';
  };
  render(first);

  return {
    el: root,
    update: render,
    tick(now) {
      for (const [slot, e] of entries) {
        const pct = holdPct(ctx, 'grab', slot, now);
        e.bar.hidden = pct === null;
        if (pct !== null) {
          e.fill.style.width = `${pct}%`;
          e.bar.dataset.progress = String(pct);
        } else delete e.bar.dataset.progress;
      }
    },
    destroy() {
      for (const e of entries.values()) e.hb.destroy();
      entries.clear();
      root.remove();
    },
  };
}
