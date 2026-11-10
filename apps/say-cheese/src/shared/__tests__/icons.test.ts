// @vitest-environment jsdom
// UI icons are inline SVG (shared/icons.ts), never emoji: emoji look different on every TV and phone.
// The reaction set (`EMOJI`) is the one exception, since it's what players send.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { icon } from '../icons';

const SRC = resolve(import.meta.dirname, '../..');
const EMOJI_RE = /\p{Emoji_Presentation}|️/u;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);
    return /\.(ts|css|html)$/.test(name) ? [path] : [];
  });
}

describe('icons', () => {
  it('no emoji in shipped source outside the reaction set', () => {
    const hits = sources(SRC).flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .map((line, i) => ({
          file: relative(SRC, path).replaceAll('\\', '/'),
          line: i + 1,
          text: line,
        }))
        .filter((l) => EMOJI_RE.test(l.text))
        .filter((l) => !(l.file === 'shared/messages.ts' && l.text.includes('export const EMOJI')))
        // brand.css is the read-only brand kit
        .filter((l) => l.file !== 'styles/brand.css'),
    );
    expect(hits).toEqual([]);
  });

  it('builds a decorative 1em SVG', () => {
    const svg = icon('pencil', 'lead');
    expect(svg.getAttribute('class')).toBe('ico lead');
    expect(svg.getAttribute('width')).toBe('1em');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('path')?.getAttribute('stroke')).toBe('currentColor');
  });
});
