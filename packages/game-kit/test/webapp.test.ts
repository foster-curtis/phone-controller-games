import { describe, expect, it } from 'vitest';
import { buildControllerManifest, transformWebAppHtml, webApp } from '../src/webapp';

const site = {
  name: 'Sunny Side Slam',
  short_name: 'Sunny Side',
  start_url: '/',
  display: 'fullscreen',
  icons: [{ src: '/icon-192.png' }],
};

const page = (extra = '') =>
  `<!doctype html><html><head><title>x</title>\n<link rel="manifest" href="/site.webmanifest">${extra}\n</head><body></body></html>`;

describe('buildControllerManifest', () => {
  it('keeps the site fields and overrides the launch fields', () => {
    const m = buildControllerManifest(site);
    expect(m).toMatchObject({
      name: 'Sunny Side Slam',
      icons: site.icons,
      id: '/play',
      start_url: '/play',
      scope: '/',
      display: 'fullscreen',
      display_override: ['fullscreen', 'standalone'],
    });
    expect(buildControllerManifest(site, '/join').start_url).toBe('/join');
  });
});

describe('transformWebAppHtml', () => {
  it('adds the four meta tags and rewrites the manifest link', () => {
    const out = transformWebAppHtml(page(), {
      manifestHref: '/play.webmanifest',
      title: 'Sunny Side',
    });
    expect(out).toContain('<link rel="manifest" href="/play.webmanifest">');
    expect(out).not.toContain('/site.webmanifest');
    expect(out).toContain('<meta name="mobile-web-app-capable" content="yes">');
    expect(out).toContain('<meta name="apple-mobile-web-app-capable" content="yes">');
    expect(out).toContain(
      '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
    );
    expect(out).toContain('<meta name="apple-mobile-web-app-title" content="Sunny Side">');
  });

  it('leaves the manifest link alone without manifestHref (host page)', () => {
    expect(transformWebAppHtml(page(), { title: 'X' })).toContain('/site.webmanifest');
  });

  it('does not duplicate tags that already exist', () => {
    const html = page('<meta name="apple-mobile-web-app-capable" content="yes">');
    const out = transformWebAppHtml(html, { title: 'X' });
    expect(out.match(/apple-mobile-web-app-capable/g)).toHaveLength(1);
    expect(transformWebAppHtml(out, { title: 'X' })).toBe(out);
  });

  it('escapes the title', () => {
    expect(transformWebAppHtml(page(), { title: 'A "B" <C>' })).toContain(
      'content="A &quot;B&quot; &lt;C>"',
    );
  });
});

describe('webApp plugin', () => {
  it('has the expected name and hooks', () => {
    const p = webApp();
    expect(p.name).toBe('pcg-web-app');
    expect(typeof p.generateBundle).toBe('function');
    expect(p.transformIndexHtml).toBeDefined();
  });
});
