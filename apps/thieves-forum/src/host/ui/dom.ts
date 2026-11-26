// TV DOM helpers (SPEC §12.2): element builder and the join / feedback QR as inline SVG.
// `qrSvg` moved here from the scaffold lobby.ts (TF6). Colors come from tv.css (`.qr-bg`, `.qr-fg`).
import { qrMatrix } from '@pcg/game-kit';

const SVG = 'http://www.w3.org/2000/svg';

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** A link as inline SVG: dark on light with a 2-module quiet zone. */
export function qrSvg(text: string, label = 'QR code'): SVGSVGElement {
  const { size, modules } = qrMatrix(text);
  const pad = 2;
  const full = String(size + pad * 2);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'qr');
  svg.setAttribute('viewBox', `0 0 ${full} ${full}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const bg = document.createElementNS(SVG, 'rect');
  bg.setAttribute('class', 'qr-bg');
  bg.setAttribute('width', full);
  bg.setAttribute('height', full);
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('class', 'qr-fg');
  let d = '';
  modules.forEach((m, i) => {
    if (m) d += `M${(i % size) + pad} ${Math.floor(i / size) + pad}h1v1h-1z`;
  });
  path.setAttribute('d', d);
  svg.append(bg, path);
  return svg;
}

/** `m:ss` for the HUD timer (rounds up so 0:00 means time is up). */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
