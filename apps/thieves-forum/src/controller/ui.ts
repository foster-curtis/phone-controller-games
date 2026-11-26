// Small DOM builders shared by the phone screens (SPEC §6.17, §6.0): buttons, coin pill, weight bar,
// item icon, countdown text. Colors, fonts and sizes come from brand.css classes and variables only.
// Never imports host code.
import { el } from '@pcg/controller-kit';
import { itemIconUrl } from './art';

export { el };

export function btn(
  text: string,
  cls: string,
  onClick: () => void,
  attrs: Record<string, string> = {},
): HTMLButtonElement {
  const b = el('button', { type: 'button', class: `btn ${cls}`, text, ...attrs });
  b.addEventListener('click', onClick);
  return b;
}

/** "5 d": denarii in mono digits (SPEC §6.0). */
export function money(n: number): string {
  return `${n} d`;
}

/** `loaf-of-bread` → "Loaf of bread" (a `wants` id the pack doesn't name). */
export function prettyName(id: string): string {
  const s = id.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ordinal(n: number): string {
  const r = n % 100;
  if (r >= 11 && r <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** An item's icon; a text stand-in when the art file is missing. */
export function itemIcon(id: string, cls = 'icon'): HTMLElement {
  const url = itemIconUrl(id);
  if (!url) return el('span', { class: `${cls} icon-missing`, text: id.slice(0, 2).toUpperCase() });
  const img = el('img', { class: cls, src: url, alt: '', draggable: 'false' });
  return img;
}

/** "5 / 15" with a fill bar (pack weight, SPEC §6.4, §6.17). */
export function weightBar(weight: number, cap: number): HTMLElement {
  const pct = cap > 0 ? Math.min(100, Math.round((weight / cap) * 100)) : 0;
  const fill = el('i');
  fill.style.width = `${pct}%`;
  return el(
    'div',
    { class: 'weight', 'data-weight': `${weight}/${cap}` },
    el('span', { class: 'label', text: `${weight} / ${cap}` }),
    el('span', { class: 'bar' }, fill),
  );
}

/** Whole seconds left, rounded up ("0" at the deadline). */
export function secs(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

/** Sets text only when it changed (ticks run every frame). */
export function setText(node: Element, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
