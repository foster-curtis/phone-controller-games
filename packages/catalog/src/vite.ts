// @pcg/catalog/vite: `catalogCheck()`, which every game's vite.config.ts adds so a bad catalog entry
// fails `vite build` (locally, in CI and on Vercel). Node only, never bundled into a page.
import type { Plugin } from 'vite';
// Explicit `.ts`: Vite loads this file with Node's own type stripping (no bundling), which needs it.
import { checkCatalog } from './node.ts';

/** Checks the whole catalog at build start: an error in a build, a warning in dev. */
export function catalogCheck(): Plugin {
  let isBuild = false;
  return {
    name: 'pcg-catalog-check',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    buildStart() {
      const errors = checkCatalog();
      if (errors.length === 0) return;
      const message = `The game catalog is invalid (@pcg/catalog):\n  - ${errors.join('\n  - ')}`;
      if (isBuild) this.error(message);
      else this.warn(message);
    },
  };
}
