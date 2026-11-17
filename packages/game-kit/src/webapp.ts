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
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
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

export interface SiteManifest {
  name?: string;
  short_name?: string;
  [key: string]: unknown;
}

/** The controller manifest derived from the brand kit's site manifest (pure). */
export function buildControllerManifest(
  site: SiteManifest,
  startUrl = '/play',
): Record<string, unknown> {
  return {
    ...site,
    id: startUrl,
    start_url: startUrl,
    scope: '/',
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'],
  };
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export interface HtmlTransformOptions {
  /** Rewrite the manifest link to this href (the controller page only). */
  manifestHref?: string;
  /** `apple-mobile-web-app-title` content. */
  title?: string;
}

/** Rewrites the manifest link and adds the home-screen meta tags that are missing (pure). */
export function transformWebAppHtml(html: string, opts: HtmlTransformOptions = {}): string {
  let out = html;
  if (opts.manifestHref !== undefined) {
    const href = escapeAttr(opts.manifestHref);
    out = out.replace(/<link\b[^>]*\brel=["']manifest["'][^>]*>/i, (tag) =>
      /\bhref=["'][^"']*["']/i.test(tag)
        ? tag.replace(/\bhref=["'][^"']*["']/i, `href="${href}"`)
        : tag.replace(/\/?>$/, ` href="${href}">`),
    );
  }
  const metas: Array<[string, string]> = [
    ['mobile-web-app-capable', 'yes'],
    ['apple-mobile-web-app-capable', 'yes'],
    ['apple-mobile-web-app-status-bar-style', 'black-translucent'],
  ];
  if (opts.title) metas.push(['apple-mobile-web-app-title', opts.title]);
  const missing = metas.filter(
    ([name]) => !new RegExp(String.raw`<meta\b[^>]*\bname=["']${name}["']`, 'i').test(out),
  );
  if (missing.length > 0) {
    const tags = missing
      .map(([name, content]) => `    <meta name="${name}" content="${escapeAttr(content)}">\n`)
      .join('');
    out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${tags}  </head>`) : tags + out;
  }
  return out;
}

/** Adds the controller's own web-app manifest and the home-screen meta tags to both pages. */
export function webApp(opts: WebAppOptions = {}): Plugin {
  const siteName = opts.siteManifest ?? 'site.webmanifest';
  const outName = opts.controllerManifest ?? 'play.webmanifest';
  const startUrl = opts.controllerStartUrl ?? '/play';
  const controllerHtml = opts.controllerHtml ?? 'play.html';
  let publicDir = '';
  let warned = false;

  const readSite = (): SiteManifest | null => {
    const file = join(publicDir, siteName);
    if (!publicDir || !existsSync(file)) return null;
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as SiteManifest;
    } catch {
      return null;
    }
  };
  const manifestJson = (): string | null => {
    const site = readSite();
    return site ? JSON.stringify(buildControllerManifest(site, startUrl), null, 2) : null;
  };

  return {
    name: 'pcg-web-app',
    configResolved(config) {
      publicDir = config.publicDir || '';
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path !== `/${outName}`) return next();
        const json = manifestJson();
        if (json === null) return next();
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(json);
      });
    },
    generateBundle() {
      const json = manifestJson();
      if (json === null) {
        if (!warned) this.warn(`pcg-web-app: no readable ${siteName} in the public dir`);
        warned = true;
        return;
      }
      this.emitFile({ type: 'asset', fileName: outName, source: json });
    },
    transformIndexHtml(html, ctx) {
      const isController =
        basename(ctx.path ?? ctx.filename ?? '').split('?')[0] === controllerHtml;
      const site = readSite();
      const title = site?.short_name ?? site?.name;
      return transformWebAppHtml(html, {
        ...(isController && site ? { manifestHref: `/${outName}` } : {}),
        ...(title ? { title } : {}),
      });
    },
  };
}
