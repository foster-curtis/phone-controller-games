// Every frame and icon key the presentation pack and the renderer reference exists in the manifest, and
// code names frames only through typed keys (`fk('…')`, `ik('…')` or the builders in
// render/keys.ts), never as a bare string (BUILD_PLAN FF3).
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { manifest } from '../../../generated/manifest';
import { CLASS_IDS } from '../../shared/ids';
import * as keys from '../../host/render/keys';
import { SENTRY_AIMS, SENTRY_LOADOUTS } from '../../host/render/types';
import { presentationHost } from '../host';
import { presentationShared } from '../shared';
import { ART_SET, isPosed, type ArtSetAssets } from '../types';

const src = join(import.meta.dirname, '..', '..');
const assets = manifest.sets[ART_SET] as ArtSetAssets;
const frames = new Set(Object.keys(assets.frames));
const icons = new Set([...assets.icons, ...assets.tiles]);

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

const files = [
  ...sources(join(src, 'presentation')),
  ...sources(join(src, 'host', 'render')),
  ...sources(join(src, 'host', 'scene')),
];

describe('asset keys', () => {
  it('scans the presentation pack and the renderer', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('every fk(…) frame and ik(…) icon literal exists in the manifest', () => {
    for (const f of files) {
      const text = code(f);
      for (const m of text.matchAll(/\bfk\('([^']+)'\)/g))
        expect(frames.has(m[1]!), `${relative(src, f)}: ${m[1]}`).toBe(true);
      for (const m of text.matchAll(/\bik\('([^']+)'\)/g))
        expect(icons.has(m[1]!), `${relative(src, f)}: ${m[1]}`).toBe(true);
    }
  });

  it('no frame name appears as a bare string literal outside fk(…)', () => {
    for (const f of files) {
      const text = code(f);
      for (const m of text.matchAll(/(['"`])([a-z0-9-]+(?:\/[a-z0-9@-]+)+)\1/g)) {
        if (!frames.has(m[2]!)) continue;
        const before = text.slice(Math.max(0, m.index! - 3), m.index);
        expect(before, `${relative(src, f)}: bare frame '${m[2]}'`).toBe('fk(');
      }
    }
  });

  it('every builder output exists', () => {
    const out: string[] = [];
    for (const lo of SENTRY_LOADOUTS)
      for (const aim of SENTRY_AIMS) out.push(keys.sentryFrame(lo, aim));
    for (let v = 1; v <= 4; v++) out.push(keys.groundFrame(v));
    for (let s = 1; s <= 5; s++) out.push(keys.scrapFrame('ours', s), keys.scrapFrame('theirs', s));
    out.push(
      ...Object.values(keys.EDGE_FRAMES),
      ...keys.DECOR_FRAMES,
      ...Object.values(keys.CITADEL),
    );
    out.push(...Object.values(keys.STATUS_FRAMES).flat());
    for (const f of out) expect(frames.has(f), f).toBe(true);
    expect(keys.iconFrame('coins')).toBe('icons/coins');
  });

  it('theme maps name real frames, icons and rigs', () => {
    const map = presentationHost.map;
    for (const f of [...map.ground, ...Object.values(map.edges), ...(map.decor ?? [])])
      expect(frames.has(f), f).toBe(true);
    for (const p of Object.values(map.portals))
      for (const f of [p.idle, p.flare]) expect(frames.has(f), f).toBe(true);
    for (const group of Object.values(presentationShared.iconFor))
      for (const id of Object.values(group)) expect(icons.has(id), id).toBe(true);
    const rigFor = presentationHost.rigFor;
    for (const r of [
      ...CLASS_IDS,
      ...Object.values(rigFor.enemy),
      rigFor.soldier,
      ...Object.values(rigFor.knight),
    ])
      expect(assets.rigs, r).toContain(r);
  });

  it('every rig part names a manifest frame', () => {
    for (const rig of Object.values(presentationHost.rigs)) {
      for (const v of Object.values(rig.views)) {
        for (const rv of isPosed(v!) ? Object.values(v.poses) : [v!]) {
          for (const p of Object.values(rv.parts)) expect(frames.has(p.frame), p.frame).toBe(true);
        }
      }
    }
  });
});
