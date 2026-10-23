import { fileURLToPath } from 'node:url';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vite';

const fromRoot = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** `/play` and `/play?code=ABCD` → `play.html`, in dev and preview (Vercel does this via `cleanUrls`). */
const rewritePlay: Connect.NextHandleFunction = (req, _res, next) => {
  if (req.url) {
    const q = req.url.indexOf('?');
    const pathname = q === -1 ? req.url : req.url.slice(0, q);
    if (pathname === '/play' || pathname === '/play/') {
      req.url = '/play.html' + (q === -1 ? '' : req.url.slice(q));
    }
  }
  next();
};

function playRoute(): Plugin {
  return {
    name: 'pcg-play-route',
    configureServer(server) {
      server.middlewares.use(rewritePlay);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewritePlay);
    },
  };
}

export default defineConfig({
  plugins: [playRoute()],
  server: { host: true, port: 5173 },
  preview: { port: 4173 },
  build: {
    manifest: true,
    // Phaser alone is ~1.4 MB minified; it only ships to the TV.
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      input: {
        host: fromRoot('./index.html'),
        controller: fromRoot('./play.html'),
      },
    },
  },
});
