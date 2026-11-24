// The game's release version and its on-screen tag (PLATFORM §5). The number lives in package.json
// and Changesets bumps it on deploy; Vite tree-shakes the JSON down to this one field.
import { version } from '../../package.json';

export const GAME_VERSION: string = version;

/**
 * A small, untappable `v1.2.3` in the bottom-right corner. Phones show it on the join and lobby
 * screens only (controller.css), so it never sits over the controls.
 */
export function mountVersionTag(parent: HTMLElement = document.body): HTMLElement {
  const tag = document.createElement('div');
  tag.className = 'version-tag caption';
  tag.textContent = `v${GAME_VERSION}`;
  tag.setAttribute('aria-hidden', 'true');
  Object.assign(tag.style, {
    position: 'fixed',
    right: 'max(var(--space-2), env(safe-area-inset-right))',
    bottom: 'max(var(--space-1), env(safe-area-inset-bottom))',
    zIndex: '10',
    color: 'var(--muted)',
    opacity: '0.7',
    pointerEvents: 'none',
    userSelect: 'none',
  });
  parent.append(tag);
  return tag;
}
