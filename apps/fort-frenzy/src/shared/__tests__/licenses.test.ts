// Asset licensing (SPEC §2.3, §15.10): every file under art/ and audio/, and every font brand/head.html
// loads, has an entry in assets/LICENSES.json that allows commercial use.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = join(import.meta.dirname, '..', '..', '..');

interface Entry {
  path?: string;
  font?: string;
  source: string;
  author: string;
  license: string;
  commercial: boolean;
}
const { entries } = JSON.parse(readFileSync(join(appRoot, 'assets', 'LICENSES.json'), 'utf8')) as {
  entries: Entry[];
};

/** Every file under `dir`, as posix paths relative to the app root. */
function walk(dir: string): string[] {
  return readdirSync(join(appRoot, dir), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => relative(appRoot, join(e.parentPath, e.name)).split('\\').join('/'));
}

/** `**` matches across folders, `*` within one. */
function globToRegExp(glob: string): RegExp {
  const re = glob
    .split('**')
    .map((part) =>
      part
        .split('*')
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*'),
    )
    .join('.*');
  return new RegExp(`^${re}$`);
}

const pathEntries = entries.filter((e) => e.path !== undefined);
const matchers = pathEntries.map((e) => ({ entry: e, re: globToRegExp(e.path!) }));
const files = [...walk('art'), ...walk('audio')];

describe('assets/LICENSES.json', () => {
  it('every entry is complete and allows commercial use', () => {
    for (const e of entries) {
      expect(e.path ?? e.font, JSON.stringify(e)).toBeTruthy();
      expect(e.source && e.author && e.license, JSON.stringify(e)).toBeTruthy();
      expect(e.commercial, e.path ?? e.font).toBe(true);
    }
  });

  it('finds the asset folders', () => {
    expect(files.some((f) => f.startsWith('art/'))).toBe(true);
    expect(files.some((f) => f.startsWith('audio/kenney/'))).toBe(true);
  });

  it('covers every file under art/ and audio/', () => {
    const uncovered = files.filter((f) => !matchers.some((m) => m.re.test(f)));
    expect(uncovered).toEqual([]);
  });

  it('has no stale path entries', () => {
    const stale = matchers.filter((m) => !files.some((f) => m.re.test(f))).map((m) => m.entry.path);
    expect(stale).toEqual([]);
  });

  it('covers every font the brand head loads', () => {
    const head = readFileSync(join(appRoot, 'brand', 'head.html'), 'utf8');
    const url = /href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/.exec(head)?.[1];
    expect(url).toBeTruthy();
    const families = [...new URL(url!.replace(/&amp;/g, '&')).searchParams.getAll('family')].map(
      (f) => f.split(':')[0]!,
    );
    expect(families.sort()).toEqual(['Chakra Petch', 'Geist', 'JetBrains Mono']);
    const fonts = entries.filter((e) => e.font).map((e) => e.font);
    for (const family of families) expect(fonts, family).toContain(family);
  });

  it('the art is owned and the Kenney packs are CC0', () => {
    expect(pathEntries.find((e) => e.path!.startsWith('art/'))?.license).toBe('owned');
    for (const e of pathEntries.filter((e) => e.path!.startsWith('audio/kenney/')))
      expect(e.license).toBe('CC0-1.0');
  });
});
