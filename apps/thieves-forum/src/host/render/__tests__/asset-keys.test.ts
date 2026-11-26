// Asset keys (BUILD_PLAN TF1, Fort Frenzy's asset-key test): every frame key used in
// src/host/render/** and src/host/gallery/** exists in generated/keys.ts, and the builders that
// make frame names (items, effects, stall pieces) only produce existing ones.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../../content';
import { MANIFEST } from '../assets';
import { EFFECT_FRAMES } from '../effectFrames';
import { EFFECT_KINDS } from '../types';

const keysTs = readFileSync(join(import.meta.dirname, '../../../../generated/keys.ts'), 'utf8');
const keyNames = new Set([...keysTs.matchAll(/\| "([^"]+)"/g)].map((m) => m[1]!));
const host = join(import.meta.dirname, '..', '..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts'))
    .map((e) => join(e.parentPath, e.name))
    .filter((f) => !f.includes('__tests__'));
}

/** Source without comments (prose may quote frame names). */
const code = (f: string) =>
  readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const files = [...sources(join(host, 'render')), ...sources(join(host, 'gallery'))];

describe('asset keys', () => {
  it('generated/keys.ts lists exactly the manifest frames', () => {
    expect(keyNames.size).toBeGreaterThan(100);
    expect([...keyNames].sort()).toEqual(Object.keys(MANIFEST.frames).sort());
  });

  it('every literal frame key in render/ and gallery/ exists', () => {
    expect(files.length).toBeGreaterThan(10);
    let seen = 0;
    for (const f of files) {
      const text = code(f);
      const literals = [
        ...[...text.matchAll(/\bpiece\('([^']+)'/g)].map((m) => m[1]!),
        ...[...text.matchAll(/\bframe: '([^']+)'/g)].map((m) => m[1]!),
        // `(['a', 'b'] as const).forEach((name) => … piece(name …`: frame name lists.
        ...[...text.matchAll(/\(\[((?:'[a-z-]+',?\s*)+)\] as const\)/g)].flatMap((m) =>
          [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!),
        ),
      ];
      for (const name of literals) {
        seen++;
        expect(keyNames.has(name), `${relative(host, f)}: ${name}`).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(15);
  });

  it('every item, effect and stall builder output exists', () => {
    for (const item of ITEMS) expect(keyNames.has(`${item.shop}/${item.id}`), item.id).toBe(true);
    for (const kind of EFFECT_KINDS)
      expect(keyNames.has(EFFECT_FRAMES[kind].frame), kind).toBe(true);
    for (const n of ['stall-back', 'stall-counter', 'stall-closed-shade', 'stall-frame'])
      expect(keyNames.has(n), n).toBe(true);
  });

  it('the stall frame carries a canopy tint layer and the reveal ring a player one', () => {
    expect(MANIFEST.frames['stall-frame']!.layers.some((l) => l.tint === 'canopy')).toBe(true);
    expect(MANIFEST.frames['player-ring']!.layers.some((l) => l.tint === 'player')).toBe(true);
  });
});
