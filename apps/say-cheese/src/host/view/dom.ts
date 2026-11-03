// Tiny DOM helpers and shared view parts for the TV views (SPEC §6.6).
import type { PlayerSummary, Standing } from '../../shared/messages';
import type { Sfx } from '../../shared/sfx';
import type { HostControl } from '../match/types';

export interface TvControls {
  emit(control: HostControl): void;
  sfx: Sfx;
  /** Origin the lobby QR points phones at (joinUrl). */
  origin: string;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Player color as CSS vars on an element (`--pc`, `--pc-on` from brand.css). */
export function paint(el: HTMLElement, p: Pick<PlayerSummary, 'color'>): void {
  el.style.setProperty('--pc', `var(--player-${p.color})`);
  el.style.setProperty('--pc-on', `var(--player-${p.color}-on)`);
}

export function chip(p: PlayerSummary, cls = 'chip'): HTMLElement {
  const el = h('span', cls, p.name);
  paint(el, p);
  return el;
}

export const seconds = (ms: number): number => Math.max(0, Math.ceil(ms / 1000));

export interface Ranked extends Standing {
  /** 1-based rank; equal scores share one. */
  rank: number;
  tie: boolean;
}

/** Lowest score first (SPEC §6.1); equal scores share a rank and are marked as ties. */
export function rankStandings(standings: Standing[]): Ranked[] {
  const sorted = [...standings].sort((a, b) => a.score - b.score);
  return sorted.map((s) => ({
    ...s,
    rank: 1 + sorted.filter((o) => o.score < s.score).length,
    tie: sorted.filter((o) => o.score === s.score).length > 1,
  }));
}

export function standingsList(standings: Standing[]): HTMLElement {
  const ol = h('ol', 'standings');
  for (const s of rankStandings(standings)) {
    const li = h('li', 'standing');
    li.dataset.player = s.playerId;
    if (s.tie) li.dataset.tie = 'true';
    if (s.left || !s.connected) li.classList.add('dim');
    li.append(
      h('span', 'rank score', `${s.tie ? 'T' : ''}${s.rank}`),
      chip(s, 'chip name'),
      h('span', 'pts score', String(s.score)),
    );
    ol.append(li);
  }
  return ol;
}
