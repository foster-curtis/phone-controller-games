// TvView → overlay sections (SPEC §2.6, §15.2). Pure: no DOM, so it's the same on the TV and in tests.
import { homeSections } from './screens/home';
import { hudSections } from './screens/hud';
import { lobbySections } from './screens/lobby';
import { summarySections } from './screens/summary';
import { esc } from './html';
import type { TvView } from './types';

/** One independently-updated piece of the overlay; `html` unchanged means the DOM is left alone. */
export interface Section {
  name: string;
  html: string;
}

/** Overlay-local state the view doesn't carry. */
export interface RenderCtx {
  /** The base bar flashes on every hit (§3.3). */
  hit: boolean;
  /** Lobby slot armed for TV removal, or null. */
  armedSlot: number | null;
}

export function sectionsFor(view: TvView, ctx: RenderCtx): Section[] {
  let out: Section[];
  switch (view.screen) {
    case 'loading':
    case 'home':
      out = homeSections(view);
      break;
    case 'lobby':
    case 'countdown':
      out = lobbySections(view, ctx);
      break;
    case 'build':
    case 'combat':
      out = hudSections(view, ctx);
      break;
    case 'victory':
    case 'defeat':
    case 'summary':
      out = summarySections(view);
      break;
    case 'restoring':
      out = [
        {
          name: 'restoring',
          html: `<div class="restoring"><div class="banner">Restoring the run…</div><div class="body">Phones stay joined while the TV reloads.</div></div>`,
        },
      ];
      break;
  }
  if (view.outdatedBanner) {
    out.push({
      name: 'outdated',
      html: `<div class="outdated tag">${esc('A phone runs a newer version: refresh the TV')}</div>`,
    });
  }
  return out;
}
