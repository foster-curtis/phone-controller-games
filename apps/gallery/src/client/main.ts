// The gallery's only shipped script (SPEC: Build and hosting; BUILD_PLAN §8). Everything else on the
// page (cards, Read more, Play) works without JavaScript. This adds the kit's theme toggle and lockup
// animation, and Vercel Web Analytics page views in production (Hobby plan: no custom events).
// Never import @pcg/catalog or src/build here: the catalog must not reach the client bundle.
import { inject } from '@vercel/analytics';
import { initLockupAnimation } from '../brand/lockup-animation.js';
import { initThemeToggle } from '../brand/theme.js';

export function main(): void {
  // Each is an extra: one failing (no matchMedia, say) must not stop the other.
  for (const init of [initThemeToggle, initLockupAnimation]) {
    try {
      init();
    } catch (err) {
      console.warn('gallery:', err);
    }
  }
  if (import.meta.env.PROD) inject();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main, { once: true });
} else {
  main();
}
