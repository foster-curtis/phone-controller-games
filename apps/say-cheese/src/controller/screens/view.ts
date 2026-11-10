// Shared bits of the phone screens (SPEC §6.7): the routed-view shape, a button helper and the
// color helpers. The screen root carries `data-screen=<kind>` (e2e `screen(page, kind)`).
import { el } from '@pcg/controller-kit';
import type { RoutedView } from '@pcg/controller-kit';
import { icon, type IconName } from '../../shared/icons';
import type { PlayerColorId, Screen, ScreenKind } from '../../shared/messages';

export type View = RoutedView<Screen>;

/** A routed view whose body is rebuilt from the latest screen on every update. */
export function renderedView<K extends ScreenKind>(
  kind: K,
  first: Screen,
  render: (screen: Extract<Screen, { kind: K }>, root: HTMLElement) => Array<Node | null | false>,
  cls = '',
): View {
  const root = el('main', { class: `screen ${cls}`.trim(), 'data-screen': kind });
  const paint = (s: Screen) => {
    root.replaceChildren(
      ...render(s as Extract<Screen, { kind: K }>, root).filter((n): n is Node => !!n),
    );
  };
  paint(first);
  return { el: root, update: paint, destroy() {} };
}

/** A bare SVG icon as the button: no pill or border, just a finger-sized tap area around it. */
export function iconButton(
  name: IconName,
  label: string,
  onClick: () => void,
  id: string,
): HTMLButtonElement {
  const b = el('button', {
    type: 'button',
    class: 'icon-btn',
    'data-action': id,
    'aria-label': label,
  });
  b.append(icon(name));
  b.addEventListener('click', onClick);
  return b;
}

export function button(
  label: string,
  onClick: () => void,
  opts: { cls?: string; disabled?: boolean; id?: string } = {},
): HTMLButtonElement {
  const b = el('button', {
    type: 'button',
    class: `btn ${opts.cls ?? ''}`.trim(),
    ...(opts.id ? { 'data-action': opts.id } : {}),
    text: label,
  });
  b.disabled = !!opts.disabled;
  b.addEventListener('click', onClick);
  return b;
}

export const heading = (text: string): HTMLElement => el('h1', { class: 'h2', text });
/** The brand title lockup: "Say" pink over "Cheese!" amber, tilted (brand.css .lockup). */
export const lockup = (): HTMLElement =>
  el(
    'h1',
    { class: 'lockup' },
    el('span', { class: 'say', text: 'Say' }),
    ' ',
    el('span', { class: 'cheese', text: 'Cheese!' }),
  );
export const para = (text: string, cls = 'body'): HTMLElement => el('p', { class: cls, text });

/** Inline style that colors an element with a player color (`--c`, `--c-on` as in brand.css .tag-ring). */
export function colorVars(color: PlayerColorId | null): string {
  return color
    ? `--c: var(--player-${color}); --c-on: var(--player-${color}-on)`
    : '--c: var(--tag-unknown); --c-on: var(--tag-unknown-on)';
}

export function chip(name: string, color: PlayerColorId, extra = ''): HTMLElement {
  const c = el('span', { class: `chip ${extra}`.trim(), style: colorVars(color), text: name });
  return c;
}
