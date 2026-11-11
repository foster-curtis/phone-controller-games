// The prerender plugin (SPEC: Build and hosting, Game cards, Status handling): fills index.html's
// game grid from @pcg/catalog at build time, and injects the head values that come from the brand
// kit (THEME_INIT, theme-color, og:image:alt) so index.html never holds a copy that could drift.
// Node only, loaded by vite.config.ts through Node's type stripping: explicit `.ts` imports and
// erasable TS only. The client bundle never imports this or the catalog.
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { GAMES, type GameMeta } from '@pcg/catalog';
import { imageFile } from '@pcg/catalog/node';
import type { HtmlTagDescriptor, Plugin } from 'vite';
import { brand } from '../brand/brand.ts';
import { THEME_INIT } from '../brand/theme.js';
import { renderGrid } from './render.ts';

export const CARDS_MARKER = '<!--gallery:cards-->';

const OG_ALT_FILE = new URL('../../public/og-image.alt.txt', import.meta.url);

const slashes = (p: string) => p.replace(/\\/g, '/');

export interface PrerenderOptions {
  /** The catalog to render. Defaults to `GAMES`; only tests override it. */
  games?: readonly GameMeta[];
}

export function prerenderGallery({ games = GAMES }: PrerenderOptions = {}): Plugin {
  let root = '';
  return {
    name: 'pcg-gallery-prerender',
    configResolved(config) {
      root = config.root;
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!html.includes(CARDS_MARKER)) {
          throw new Error(`prerenderGallery: index.html has no ${CARDS_MARKER}`);
        }
        const dev = ctx.server !== undefined;
        // Build: a path relative to index.html, which Vite's HTML pipeline hashes into assets/.
        // Dev: the file itself, served through /@fs/ (the workspace root is in server.fs.allow).
        const imageSrc = (game: GameMeta) => {
          const file = slashes(imageFile(game));
          if (dev) return `/@fs${file.startsWith('/') ? '' : '/'}${file}`;
          return slashes(relative(root, imageFile(game)));
        };
        const ogAlt = readFileSync(OG_ALT_FILE, 'utf8').trim();
        const tags: HtmlTagDescriptor[] = [
          // Inline and first, before any stylesheet, so there's no flash of the wrong theme.
          { tag: 'script', children: THEME_INIT, injectTo: 'head-prepend' },
          {
            tag: 'meta',
            attrs: { name: 'theme-color', content: brand.colors.ink },
            injectTo: 'head',
          },
          // Vite escapes attribute values.
          { tag: 'meta', attrs: { property: 'og:image:alt', content: ogAlt }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'twitter:image:alt', content: ogAlt }, injectTo: 'head' },
        ];
        return { html: html.replace(CARDS_MARKER, renderGrid(games, { imageSrc })), tags };
      },
    },
  };
}
