// Tiny HTML-string helpers for the overlay's screens. Names come from phones, so every dynamic text
// goes through `esc`.
import type { QrMatrix } from '@pcg/game-kit';
import type { ClassId, EnemyId, PlayerColorId } from '../../shared/ids';
import { enemyParts, portraitFiles } from './art';
import { COLOR_VAR } from './labels';

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]!);

/** `<use>` of a sprite symbol (the sprite is injected once by the overlay). */
export const icon = (id: string, cls = ''): string =>
  `<svg class="ic ${cls}" aria-hidden="true"><use href="#icon-${id}"/></svg>`;

/** Badge: the glyph on its chamfered tile; `state` is `rest`, `active` or `dim`. */
export const badge = (id: string, state: 'rest' | 'active' | 'dim' = 'rest'): string =>
  `<span class="badge ${state}">${icon(state === 'active' ? 'badge-tile-active' : 'badge-tile', 'tile')}${icon(id, 'glyph')}</span>`;

/** A knight's front view in the player's color: white body image with the color mask multiplied over it. */
export function portrait(classId: ClassId, color: PlayerColorId): string {
  const f = portraitFiles(classId);
  return (
    `<span class="portrait"><img src="${esc(f.body)}" alt="" />` +
    `<span class="tint" data-mask="${esc(f.mask)}" style="background:${COLOR_VAR(color)}"></span></span>`
  );
}

/** An enemy's side view, parts stacked in draw order (they share one viewBox). */
export function enemyArt(enemy: EnemyId): string {
  const { urls } = enemyParts(enemy);
  return `<span class="enemy-art">${urls.map((u) => `<img src="${esc(u)}" alt="" />`).join('')}</span>`;
}

/** QR as one SVG path, quiet zone of 2 modules. White ground, ink modules (a scannable code needs contrast). */
export function qrSvg(qr: QrMatrix): string {
  const q = 2;
  const n = qr.size + q * 2;
  let d = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y * qr.size + x]) d += `M${x + q} ${y + q}h1v1h-1z`;
    }
  }
  return (
    `<svg class="qr" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-label="QR code to join">` +
    `<rect width="${n}" height="${n}" fill="var(--brand-paper)"/><path d="${d}" fill="var(--brand-ink)"/></svg>`
  );
}

/** Chamfered panel with a colored edge: wrapper (glow) > edge (clipped fill) > inner (clipped, inset). */
export const panel = (inner: string, cls = '', style = ''): string =>
  `<div class="pnl ${cls}" style="${style}"><div class="edge"><div class="in">${inner}</div></div></div>`;
