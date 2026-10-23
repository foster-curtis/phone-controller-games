// Per-round points breakdown for the results / matchEnd screens (SPEC §6.7, C2 note).
import { el } from '../dom';
import type { RoundBreakdown, RoundBreakdownEntry, RoundPointItem } from '../../shared/messages';
import { colorOnVar, colorVar } from './common';

const signed = (n: number): string => (n >= 0 ? `+${n}` : String(n));

/** Item label from the item's own `points` (never hardcoded). */
export function itemLabel(it: RoundPointItem, short = false): string {
  if (it.kind === 'ko') return `${short ? '' : 'KO '}${it.victimName} ${signed(it.points)}`;
  return `Survivor ${signed(it.points)}`;
}

export function outText(e: RoundBreakdownEntry): string {
  if (!e.out) return 'Survived';
  return e.out.byName ? `Knocked out by ${e.out.byName}` : 'Fell off';
}

function mineCard(e: RoundBreakdownEntry): HTMLElement {
  const card = el('div', { class: `bd-mine${e.left ? ' left' : ''}`, 'data-bd': 'mine' });
  card.style.background = colorVar(e.color);
  card.style.color = colorOnVar(e.color);
  const top = el('div', { class: 'bd-mine-top' });
  top.append(
    el('span', { class: 'h2 bd-pts', text: `${signed(e.points)} this round` }),
    el('span', { class: 'label bd-total', text: `Total ${e.total}` }),
  );
  const items = el('div', { class: 'bd-items' });
  for (const it of e.items)
    items.append(el('span', { class: 'bd-item label', text: itemLabel(it) }));
  if (!e.items.length) items.append(el('span', { class: 'bd-item label', text: 'No points' }));
  card.append(top, items, el('div', { class: 'caption bd-out', text: outText(e) }));
  return card;
}

function otherRow(e: RoundBreakdownEntry): HTMLElement {
  const row = el('li', { class: `bd-row${e.left ? ' left' : ''}`, 'data-bd': 'row' });
  const chip = el('span', { class: 'bd-chip label', text: e.name });
  chip.style.background = colorVar(e.color);
  chip.style.color = colorOnVar(e.color);
  const detail = [...e.items.map((i) => itemLabel(i, true)), outText(e)].join(' · ');
  row.append(
    chip,
    el('span', { class: 'bd-pts-s score-num', text: signed(e.points) }),
    el('span', { class: 'caption bd-detail', text: detail }),
  );
  return row;
}

/** null when there is nothing to show. `myName` identifies this phone's own entry. */
export function breakdownSection(
  b: RoundBreakdown | null | undefined,
  myName: string,
): HTMLElement | null {
  if (!b || !b.players.length) return null;
  const sec = el('section', { class: 'breakdown', 'data-section': 'breakdown' });
  sec.append(el('h2', { class: 'label bd-title', text: `Round ${b.round}` }));
  const mine = b.players.find((p) => p.name === myName);
  if (mine) sec.append(mineCard(mine));
  const list = el('ul', { class: 'bd-list' });
  for (const p of b.players) if (p !== mine) list.append(otherRow(p));
  if (list.childElementCount) sec.append(list);
  return sec;
}
