// Packed atlases (SPEC §15.10): every frame at 1× and 2×, an `@unlit` variant for every frame with
// `class="glow"` groups (and none without), every icon and tile, no atlas over 4096².
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { atlasFiles, ICON_FRAME_PREFIX, UNLIT_SUFFIX } from '../../../generated/keys';
import { manifest } from '../../../generated/manifest';
import type { ThemeAssets } from '../types';

const generated = join(import.meta.dirname, '..', '..', '..', 'generated');
const assets = manifest.themes['neon-knights'] as ThemeAssets;

interface AtlasJson {
  frames: Record<
    string,
    { frame: { x: number; y: number; w: number; h: number }; sourceSize: { w: number; h: number } }
  >;
  meta: { size: { w: number; h: number }; scale: string };
}

function framesAt(scale: 1 | 2): Map<string, AtlasJson['frames'][string]> {
  const out = new Map<string, AtlasJson['frames'][string]>();
  for (const a of atlasFiles.filter((f) => f.scale === scale)) {
    const json = JSON.parse(readFileSync(join(generated, a.json), 'utf8')) as AtlasJson;
    expect(json.meta.size.w).toBeLessThanOrEqual(4096);
    expect(json.meta.size.h).toBeLessThanOrEqual(4096);
    for (const [k, v] of Object.entries(json.frames)) out.set(k, v);
  }
  return out;
}

describe.each([1, 2] as const)('atlases at %i×', (scale) => {
  const packed = framesAt(scale);

  it('packs every frame, icon and tile', () => {
    for (const name of Object.keys(assets.frames)) expect(packed.has(name), name).toBe(true);
    for (const id of [...assets.icons, ...assets.tiles])
      expect(packed.has(ICON_FRAME_PREFIX + id), id).toBe(true);
  });

  it('has an @unlit variant for every frame with glow, and only those', () => {
    const glow = Object.entries(assets.frames).filter(([, f]) => f.glow);
    expect(glow.length).toBeGreaterThan(100);
    for (const [name] of glow) expect(packed.has(name + UNLIT_SUFFIX), name).toBe(true);
    for (const name of packed.keys()) {
      if (!name.endsWith(UNLIT_SUFFIX)) continue;
      expect(assets.frames[name.slice(0, -UNLIT_SUFFIX.length)]?.glow, name).toBe(true);
    }
  });

  it('rasterizes at 0.6 px per sprite unit × scale (one tile = 48 px at 1×)', () => {
    const tile = packed.get('ground/1')!;
    const vb = assets.frames['ground/1']!.viewBox;
    expect(tile.sourceSize.w).toBe(Math.round(vb[2] * 0.6 * scale));
    // An unlit variant keeps its lit frame's size and trim box source.
    const lit = packed.get('drone/side/head')!;
    const dark = packed.get('drone/side/head@unlit')!;
    expect(dark.sourceSize).toEqual(lit.sourceSize);
  });
});

describe('atlas files', () => {
  it('has 1× and 2× atlases', () => {
    expect(atlasFiles.some((a) => a.scale === 1)).toBe(true);
    expect(atlasFiles.some((a) => a.scale === 2)).toBe(true);
    for (const a of atlasFiles) {
      expect(a.size[0]).toBeLessThanOrEqual(4096);
      expect(a.size[1]).toBeLessThanOrEqual(4096);
    }
  });
});
