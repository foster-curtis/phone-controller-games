import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vite';
import { lanBanner, pickLanAddress } from './src/host/lan.ts';

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

/**
 * Dev server only: prints the TV host URL with the LAN IP under Vite's own URLs (`pnpm dev:lan`) and
 * exposes the IP to the host page as `import.meta.env.VITE_LAN_HOST` (the localhost banner).
 */
function lanUrl(): Plugin {
  const address = pickLanAddress(networkInterfaces());
  return {
    name: 'pcg-lan-url',
    apply: 'serve',
    config: () => ({ define: { 'import.meta.env.VITE_LAN_HOST': JSON.stringify(address ?? '') } }),
    configureServer(server) {
      const print = server.printUrls.bind(server);
      server.printUrls = () => {
        print();
        const addr = server.httpServer?.address();
        const port = addr && typeof addr === 'object' ? addr.port : server.config.server.port;
        if (server.config.server.host && port) server.config.logger.info(lanBanner(address, port));
      };
    },
  };
}

export default defineConfig({
  plugins: [playRoute(), lanUrl()],
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
