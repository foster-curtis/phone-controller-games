// The top banner: filled with the player's color, connectivity dot then name on the left, and a slot on
// the right (the play surface mounts its hold-to-pause button there). Neutral before a color is assigned.
import type { PlayerColorId } from '../shared/messages';
import { el } from './dom';
import { colorOnVar, colorVar } from './screens/common';

export const DEFAULT_BANNER_TEXT = 'Sunny Side Shove';

export interface Banner {
  el: HTMLElement;
  /** The right-hand slot (pause button on the play surface). */
  slot: HTMLElement;
  setProfile(name: string | null | undefined, color: PlayerColorId | null | undefined): void;
  setConnected(connected: boolean): void;
}

export function createBanner(): Banner {
  const dot = el('span', { class: 'conn-dot', 'aria-hidden': 'true' });
  const name = el('span', { class: 'banner-name', text: DEFAULT_BANNER_TEXT });
  const slot = el('div', { class: 'banner-slot' });
  const root = el('header', { class: 'top-banner', 'data-banner': '' }, dot, name, slot);
  const banner: Banner = {
    el: root,
    slot,
    setProfile(n, color) {
      name.textContent = n?.trim() || DEFAULT_BANNER_TEXT;
      root.style.setProperty('--banner-bg', colorVar(color));
      root.style.setProperty('--banner-on', colorOnVar(color));
      root.dataset.color = color ?? '';
    },
    setConnected(connected) {
      dot.classList.toggle('on', connected);
      root.dataset.connected = String(connected);
    },
  };
  banner.setProfile(null, null);
  banner.setConnected(false);
  return banner;
}
