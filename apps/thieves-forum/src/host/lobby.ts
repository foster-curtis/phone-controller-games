// TV title / lobby (SPEC §6.16, §6.18): the bare coin mark, the title in Cinzel, the placeholder
// tagline, the room code and join QR, and the joined players' names. DOM over the Phaser canvas.
// Setup shell: no colors, Ready or Start yet.
import { joinUrl, qrMatrix } from '@pcg/game-kit';
import markUrl from '../../brand/mark.svg?url';
import { title } from '../../game.meta';

/** SPEC §6.0 (placeholder, §10 open question 1). */
export const TAGLINE = 'Blend in. Swipe gold. Don’t get caught.';

const SVG = 'http://www.w3.org/2000/svg';

export interface LobbyView {
  code: string | null;
  names: string[];
}

export interface Lobby {
  readonly root: HTMLElement;
  update(view: LobbyView): void;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** The join link as inline SVG: black on white with a 2-module quiet zone. */
export function qrSvg(text: string): SVGSVGElement {
  const { size, modules } = qrMatrix(text);
  const pad = 2;
  const full = String(size + pad * 2);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'qr');
  svg.setAttribute('viewBox', `0 0 ${full} ${full}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Join QR code');
  const bg = document.createElementNS(SVG, 'rect');
  bg.setAttribute('width', full);
  bg.setAttribute('height', full);
  bg.setAttribute('fill', '#fff');
  const path = document.createElementNS(SVG, 'path');
  let d = '';
  modules.forEach((m, i) => {
    if (m) d += `M${(i % size) + pad} ${Math.floor(i / size) + pad}h1v1h-1z`;
  });
  path.setAttribute('d', d);
  path.setAttribute('fill', '#000');
  svg.append(bg, path);
  return svg;
}

export function createLobby(parent: HTMLElement, origin: string): Lobby {
  const root = h('section', 'lobby');
  root.dataset.screen = 'lobby';

  const brand = h('div', 'lobby-brand');
  const mark = h('img', 'lobby-mark');
  mark.src = markUrl;
  mark.alt = '';
  brand.append(mark, h('h1', 'title', title), h('p', 'lobby-tagline body', TAGLINE));

  const join = h('div', 'lobby-join');
  const qr = h('div', 'lobby-qr');
  const code = h('div', 'lobby-code code-tv');
  code.dataset.role = 'room-code';
  join.append(h('p', 'label', 'Scan to join, or enter the code'), qr, code);

  const players = h('div', 'lobby-players');
  const list = h('ul', 'lobby-list');
  list.dataset.role = 'players';
  const empty = h('p', 'caption lobby-empty', 'Waiting for shoppers…');
  players.append(h('h2', 'h2', 'Shoppers'), list, empty);

  root.append(brand, join, players);
  parent.append(root);

  let shownCode: string | null = null;
  return {
    root,
    update(view) {
      if (view.code !== shownCode) {
        shownCode = view.code;
        code.textContent = view.code ?? '····';
        qr.replaceChildren(...(view.code ? [qrSvg(joinUrl(origin, view.code))] : []));
      }
      list.replaceChildren(
        ...view.names.map((n) => {
          const li = h('li', 'name-tv', n);
          li.dataset.role = 'player';
          return li;
        }),
      );
      empty.hidden = view.names.length > 0;
    },
  };
}
