// "THIS IS YOU" outfit card (SPEC §6.11, §6.17): the citizen front view with the player's tunic, mantle,
// hair and skin tinted through CSS variables, on a travertine circle. Fabrics come from brand.css
// (`--fabric-*`). Hair and skin tones have no brand tokens, so this file holds a small phone-local table
// until TF1's renderer table is wired (BUILD_PLAN §8 [TF5] decision).
// Never imports host code.
import citizenFront from '../../art/forum/characters/citizen/front.svg?raw';
import type { Outfit } from '../content/types';
import { el } from './ui';

/** Skin tones, light to dark (index = `Outfit.skin`; wraps). */
export const SKIN_TONES = [
  '#f0c8a0',
  '#d9a577',
  '#c8946c',
  '#a8744f',
  '#8a5a3c',
  '#6b4429',
] as const;
/** Hair tones (index = `Outfit.hair`; wraps). */
export const HAIR_TONES = [
  '#14100c',
  '#3b2a20',
  '#5a3b26',
  '#8a5a2b',
  '#b58a4a',
  '#a8a8a8',
] as const;

const pick = <T>(xs: readonly T[], i: number): T => xs[Math.abs(i) % xs.length]!;

/** CSS variables that tint the citizen art for `outfit`. */
export function outfitVars(o: Outfit): Record<string, string> {
  return {
    '--tunic': `var(--fabric-${o.tunic})`,
    '--mantle': `var(--fabric-${o.mantle})`,
    '--skin': pick(SKIN_TONES, o.skin),
    '--hair': pick(HAIR_TONES, o.hair),
  };
}

/** The card: `.outfit-card` with the tinted figure inside; `small` is the corner version. */
export function outfitCard(o: Outfit, small = false): HTMLElement {
  const fig = el('div', { class: 'figure', 'aria-hidden': 'true' });
  fig.innerHTML = citizenFront;
  const card = el(
    'div',
    { class: small ? 'outfit-card small' : 'outfit-card', 'data-outfit': '' },
    fig,
  );
  for (const [k, v] of Object.entries(outfitVars(o))) card.style.setProperty(k, v);
  return card;
}
