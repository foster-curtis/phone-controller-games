// Build tests (SPEC: Status handling, Build and hosting, Done when): runs a real `vite build` of the
// gallery into a temp folder. A fixture catalog proves hidden games leave no trace in the output and
// the catalog never reaches the client bundle; the real catalog proves every listed game gets a card.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEEDBACK_FORM_URL, GAMES, listedGames, type GameMeta } from '@pcg/catalog';
import { imageFile } from '@pcg/catalog/node';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { brand } from '../../brand/brand.ts';
import { THEME_INIT } from '../../brand/theme.js';
import { prerenderGallery } from '../prerender.ts';
import { escapeHtml } from '../render.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const IMAGE_EXT = /\.(jpe?g|png|webp|svg|gif|avif)$/i;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

function metaContent(html: string, key: string): string | undefined {
  const tag = new RegExp(`<meta[^>]*(?:name|property)="${key}"[^>]*>`).exec(html)?.[0];
  const content = tag && /content="([^"]*)"/.exec(tag)?.[1];
  return content === undefined ? undefined : decode(content);
}

async function buildGallery(outDir: string, games?: readonly GameMeta[]): Promise<void> {
  await build({
    root: ROOT,
    logLevel: 'silent',
    ...(games
      ? { configFile: false, plugins: [prerenderGallery({ games })] }
      : { configFile: join(ROOT, 'vite.config.ts') }),
    build: { outDir, emptyOutDir: true },
  });
}

const gameIds = (html: string) =>
  [...html.matchAll(/<article class="game-card" data-game="([^"]+)"/g)].map((m) => m[1]);

describe('build with a fixture catalog', () => {
  const PROBE = 'ZZPROBE';
  const [first, second, third] = GAMES;
  const fixture: GameMeta[] = [
    { ...first!, status: 'beta' },
    {
      ...second!,
      status: 'hidden',
      title: `${PROBE} hidden title`,
      shortDescription: `${PROBE} hidden short description`,
      longDescription: `${PROBE} hidden long description.\n\n${PROBE} second paragraph.`,
    },
    { ...third!, status: 'live' },
  ];
  const hidden = fixture[1]!;
  const listed = [fixture[0]!, fixture[2]!];

  let out = '';
  let html = '';
  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), 'pcg-gallery-fixture-'));
    await buildGallery(out, fixture);
    html = readFileSync(join(out, 'index.html'), 'utf8');
  });
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it('renders the listed games, with the pill on the beta only', () => {
    expect(gameIds(html)).toEqual(listed.map((g) => g.id));
    for (const g of listed) expect(html).toContain(escapeHtml(g.title));
    expect(html.match(/class="pill"/g)).toHaveLength(1);
    const betaCard = html.slice(html.indexOf(`data-game="${listed[0]!.id}"`));
    expect(betaCard.slice(0, betaCard.indexOf('</article>'))).toContain('Playtest');
  });

  it('leaves no trace of the hidden game in any output file', () => {
    for (const file of files(out)) {
      expect(readFileSync(file).includes(PROBE), file).toBe(false);
    }
  });

  it("doesn't emit the hidden game's card art", () => {
    const art = readFileSync(imageFile(hidden));
    const images = files(out).filter((f) => IMAGE_EXT.test(f));
    expect(images.length).toBeGreaterThan(0);
    for (const file of images) expect(readFileSync(file).equals(art), file).toBe(false);
  });

  it('emits each listed card image under assets/', () => {
    for (const g of listed) {
      const art = readFileSync(imageFile(g));
      const match = files(join(out, 'assets')).find((f) => readFileSync(f).equals(art));
      expect(match, g.id).toBeDefined();
    }
  });

  it('keeps the catalog out of the client bundle', () => {
    const js = files(out).filter((f) => f.endsWith('.js'));
    expect(js.length).toBeGreaterThan(0);
    for (const file of js) {
      const code = readFileSync(file, 'utf8');
      for (const g of [...GAMES, ...fixture]) {
        expect(code.includes(g.shortDescription), `${file}: ${g.id}`).toBe(false);
      }
    }
  });

  it('starts the head with THEME_INIT, before any stylesheet or other script', () => {
    const head = /<head>\s*<script>([\s\S]*?)<\/script>/.exec(html);
    expect(head?.[1]).toBe(THEME_INIT);
    const themeAt = html.indexOf(`<script>${THEME_INIT}</script>`);
    expect(themeAt).toBeGreaterThan(0);
    expect(html.indexOf('<script')).toBe(themeAt);
    expect(html.indexOf('rel="stylesheet"')).toBeGreaterThan(themeAt);
  });

  it('takes theme-color and the OG alt text from the kit', () => {
    const alt = readFileSync(join(ROOT, 'public', 'og-image.alt.txt'), 'utf8').trim();
    expect(metaContent(html, 'theme-color')).toBe(brand.colors.ink);
    expect(metaContent(html, 'og:image:alt')).toBe(alt);
    expect(metaContent(html, 'twitter:image:alt')).toBe(alt);
    expect(html.match(/name="theme-color"/g)).toHaveLength(1);
  });

  it('copies the kit public files through', () => {
    for (const f of ['404.html', 'og-image.png', 'site.webmanifest', 'fonts/geist-400.woff2']) {
      expect(existsSync(join(out, f)), f).toBe(true);
    }
  });
});

describe('build with the real catalog', () => {
  let out = '';
  let html = '';
  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), 'pcg-gallery-real-'));
    await buildGallery(out);
    html = readFileSync(join(out, 'index.html'), 'utf8');
  });
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it('renders one card per listed game, in catalog order', () => {
    expect(gameIds(html)).toEqual(listedGames().map((g) => g.id));
    expect(html.match(/class="button"[^>]*aria-label="Play /g)).toHaveLength(listedGames().length);
  });

  it('links the plain feedback form from a banner above the footer (PLATFORM decision #11)', () => {
    const banner = html.slice(html.indexOf('class="feedback-banner"'), html.indexOf('</main>'));
    expect(banner).toContain('Played one of my games?');
    const link = /<a class="button" href="([^"]+)">Give feedback here!/.exec(banner);
    expect(decode(link?.[1] ?? '')).toBe(FEEDBACK_FORM_URL);
    expect(html.slice(html.indexOf('<footer'))).not.toContain('docs.google.com');
    expect(html).not.toContain('<!--gallery:');
    expect(html).not.toContain('entry.');
  });
});
