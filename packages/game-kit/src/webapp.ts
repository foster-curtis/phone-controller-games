// Web-app manifest and home-screen meta tags for every game (PLATFORM §3; controller-compat F0 contract,
// F3 builds it). Node only (a Vite plugin); exported from `@pcg/game-kit/vite`.
//
// The brand kit's `public/site.webmanifest` (read-only) stays the TV page's manifest. The controller
// page gets its own `/play.webmanifest`, generated from it at dev and build time, so a phone that adds
// the controller to its home screen launches the join screen (`/play`), not the TV page:
//   { ...site, id: '/play', start_url: '/play', scope: '/', display: 'fullscreen',
//     display_override: ['fullscreen', 'standalone'] }
// and `play.html`'s `<link rel="manifest">` is rewritten to it. Both pages get, when missing:
//   <meta name="mobile-web-app-capable" content="yes">
//   <meta name="apple-mobile-web-app-capable" content="yes">
//   <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
//   <meta name="apple-mobile-web-app-title" content="<manifest short_name ?? name>">
// Frozen at controller-compat F0: additive changes only.
import type { Plugin } from 'vite';

export interface WebAppOptions {
  /** The brand kit's manifest under `public/`. Default `site.webmanifest`. */
  siteManifest?: string;
  /** Generated controller manifest path. Default `play.webmanifest`. */
  controllerManifest?: string;
  /** Controller `start_url` and `id`. Default `/play`. */
  controllerStartUrl?: string;
  /** The controller page's HTML file. Default `play.html`. */
  controllerHtml?: string;
}

/** F3 implements. F0 stub: a plugin that does nothing yet. */
export function webApp(_opts: WebAppOptions = {}): Plugin {
  return { name: 'pcg-web-app' };
}
