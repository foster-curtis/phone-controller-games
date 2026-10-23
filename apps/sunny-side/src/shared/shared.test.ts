import { describe, expect, it } from 'vitest';
import { BRAND_FONT_FACES, loadBrandFonts } from './fonts';
import { isInput } from './messages';
import { relayUrl } from './relayUrl';

describe('isInput', () => {
  it('accepts valid tuples and rejects the rest', () => {
    expect(isInput([0, 0, 0, 0, 0])).toBe(true);
    expect(isInput([-100, 100, 3, 12, 4])).toBe(true);
    expect(isInput([101, 0, 0, 0, 0])).toBe(false);
    expect(isInput([0, 0, 4, 0, 0])).toBe(false);
    expect(isInput([0.5, 0, 0, 0, 0])).toBe(false);
    expect(isInput([0, 0, 0, 0])).toBe(false);
    expect(isInput({ t: 'pause' })).toBe(false);
  });
});

describe('relayUrl', () => {
  it('prefers VITE_RELAY_URL, else the page host on 8787', () => {
    expect(relayUrl('wss://relay.example', 'tv.local')).toBe('wss://relay.example');
    expect(relayUrl('', '192.168.1.5')).toBe('ws://192.168.1.5:8787');
    expect(relayUrl(undefined, 'localhost')).toBe('ws://localhost:8787');
  });
});

describe('loadBrandFonts', () => {
  const fakeFonts = (load: (face: string) => Promise<FontFace[]>) =>
    ({ load }) as unknown as FontFaceSet;

  it('covers the 3 brand families / 4 faces', () => {
    expect(BRAND_FONT_FACES).toEqual([
      '400 1em "Lilita One"',
      '400 1em "Geist"',
      '600 1em "Geist"',
      '600 1em "JetBrains Mono"',
    ]);
  });

  it('resolves false without document.fonts', async () => {
    await expect(loadBrandFonts(10, undefined)).resolves.toBe(false);
  });

  it('resolves true when every face loads', async () => {
    await expect(
      loadBrandFonts(
        1000,
        fakeFonts(async () => [{} as FontFace]),
      ),
    ).resolves.toBe(true);
  });

  it('resolves false on timeout or error, never rejects', async () => {
    await expect(
      loadBrandFonts(
        10,
        fakeFonts(() => new Promise(() => {})),
      ),
    ).resolves.toBe(false);
    await expect(
      loadBrandFonts(
        1000,
        fakeFonts(() => Promise.reject(new Error('x'))),
      ),
    ).resolves.toBe(false);
    await expect(
      loadBrandFonts(
        1000,
        fakeFonts(() => {
          throw new Error('sync');
        }),
      ),
    ).resolves.toBe(false);
  });
});
