// @pcg/game-kit/vite: dev/preview plugins every game's vite.config.ts uses (Node only, never bundled
// into a page). Frozen at FF0 (Fort Frenzy BUILD_PLAN §3): additive changes only.
import { networkInterfaces } from 'node:os';
import type { Connect, Plugin } from 'vite';
// Explicit `.ts`: Vite loads this file with Node's own type stripping (no bundling), which needs it.
import { lanBanner, pickLanAddress } from './lan.ts';

/** Rewrites `/play` and `/play?code=ABCD` to `play.html` (Vercel does this via `cleanUrls`). */
export const rewritePlay: Connect.NextHandleFunction = (req, _res, next) => {
  if (req.url) {
    const q = req.url.indexOf('?');
    const pathname = q === -1 ? req.url : req.url.slice(0, q);
    if (pathname === '/play' || pathname === '/play/') {
      req.url = '/play.html' + (q === -1 ? '' : req.url.slice(q));
    }
  }
  next();
};

/** `/play` → `play.html`, in dev and preview. */
export function playRoute(): Plugin {
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
 * Dev server only: prints the TV host URL with the LAN IP under Vite's own URLs (`pnpm dev:lan:<game>`)
 * and exposes the IP to the host page as `import.meta.env.VITE_LAN_HOST` (the localhost banner).
 */
export function lanUrl(): Plugin {
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
