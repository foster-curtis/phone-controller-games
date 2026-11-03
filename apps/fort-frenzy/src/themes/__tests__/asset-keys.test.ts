// Every frame and icon key the theme pack and the renderer reference exists in the manifest, and
// code names frames only through typed keys (`fk('…')`, `ik('…')` or the builders in
// render/keys.ts), never as a bare string (BUILD_PLAN FF3).
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { manifest } from '../../../generated/manifest';
import { LANE_IDS } from '../../shared/ids';
import { ALL_MASKS } from '../../host/render/autotile';
import * as keys from '../../host/render/keys';
import { SENTRY_AIMS, SENTRY_LOADOUTS, TURRET_AIMS, type TowerTier } from '../../host/render/types';
import { neonKnightsHost } from '../neon-knights/host';
import { neonKnightsShared } from '../neon-knights/shared';
import { isPosed, type ThemeAssets } from '../types';

const src = join(import.meta.dirname, '..', '..');
const assets = manifest.themes['neon-knights'] as ThemeAssets;
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
  ...sources(join(src, 'themes')),
  ...sources(join(src, 'host', 'render')),
  ...sources(join(src, 'host', 'scene')),
];

describe('asset keys', () => {
  it('scans the theme pack and the renderer', () => {
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
    for (const m of ALL_MASKS) {
      out.push(
        keys.wallFrame(m),
        keys.wallRailFrame(m),
        keys.wallChargedFrame(m),
        keys.wallDmgFrame(m),
        keys.netFrame(m),
      );
    }
    for (const tier of [0, 1, 2, 3] as TowerTier[]) {
      out.push(keys.turretPedestalFrame(tier));
      for (const aim of TURRET_AIMS) out.push(keys.turretHeadFrame(tier, aim));
    }
    out.push(...keys.TURRET_BANDS);
    for (const lo of SENTRY_LOADOUTS)
      for (const aim of SENTRY_AIMS) out.push(keys.sentryFrame(lo, aim));
    for (let v = 1; v <= 4; v++) out.push(keys.groundFrame(v));
    for (const lane of LANE_IDS)
      out.push(keys.laneFrame(lane, 'open'), keys.laneFrame(lane, 'sealed'));
    for (let s = 1; s <= 5; s++) out.push(keys.scrapFrame('ours', s), keys.scrapFrame('theirs', s));
    out.push(
      ...Object.values(keys.EDGE_FRAMES),
      ...keys.DECOR_FRAMES,
      ...Object.values(keys.CITADEL),
    );
    out.push(...Object.values(keys.STATUS_FRAMES).flat(), ...Object.values(keys.PIP_FRAMES));
    for (const f of out) expect(frames.has(f), f).toBe(true);
    expect(keys.iconFrame('coins')).toBe('icons/coins');
  });

  it('theme maps name real frames, icons and rigs', () => {
    const map = neonKnightsHost.map;
    for (const f of [...map.ground, ...Object.values(map.edges), ...(map.decor ?? [])])
      expect(frames.has(f), f).toBe(true);
    for (const l of Object.values(map.lanes))
      for (const f of [l.open, l.sealed]) expect(frames.has(f), f).toBe(true);
    for (const group of Object.values(neonKnightsShared.iconFor))
      for (const id of Object.values(group)) expect(icons.has(id), id).toBe(true);
    const rigFor = neonKnightsHost.rigFor;
    for (const r of [
      ...Object.values(rigFor.class),
      ...Object.values(rigFor.enemy),
      rigFor.soldier,
      ...Object.values(rigFor.structure),
    ])
      expect(assets.rigs, r).toContain(r);
  });

  it('every rig part names a manifest frame', () => {
    for (const rig of Object.values(neonKnightsHost.rigs)) {
      for (const v of Object.values(rig.views)) {
        for (const rv of isPosed(v!) ? Object.values(v.poses) : [v!]) {
          for (const p of Object.values(rv.parts)) expect(frames.has(p.frame), p.frame).toBe(true);
        }
      }
    }
  });
});
