// Generated asset manifest (SPEC §15.2, §15.10): covers every source SVG outside review/ and icons/,
// every rig and every icon id SPEC §2.6 lists. `pnpm test` runs `pnpm assets` first.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { manifest } from '../../../generated/manifest';
import { THEME_IDS } from '../../shared/ids';
import { ICON_SYMBOL_PREFIX, VIEW_IDS, type ThemeAssets } from '../types';

const appRoot = join(import.meta.dirname, '..', '..', '..');

/** SPEC §2.6 icon ids, copied from the spec. */
const SPEC_ICON_IDS = [
  // classes
  'class-warden',
  'class-ranger',
  'class-commander',
  'class-artificer',
  // main attacks and supers
  ...['warden', 'ranger', 'commander', 'artificer'].flatMap((c) => [`main-${c}`, `super-${c}`]),
  // structures
  'cell',
  'turret',
  'mortar',
  'wall',
  'net',
  'fortify',
  // action button
  'act-pickup',
  'act-deliver',
  'act-buy',
  'act-place',
  'act-throw',
  'act-flag',
  'act-recall',
  'act-give',
  'act-drop',
  // upgrade-card marks
  'card-vitality',
  'card-might',
  'card-haste',
  'card-reach',
  'card-swiftness',
  'card-focus',
  'card-toughness',
  'card-recovery',
  'card-attack',
  'card-super',
  'card-passive',
  'card-effect',
  'card-hunter',
  'card-ally',
  'card-supply',
  'card-squad',
  'card-combo',
  // lobby and status
  'leader',
  'overflow-shield',
  // shop and HUD
  'coins',
  'ready',
  'request',
  'repair',
  'emergency-kit',
  'base-armor',
  'sentry-damage',
  'sentry-range',
  'sentry-third',
  'squad',
  'turret-rate',
  'mortar-radius',
  'tower-hp',
  'wall-hp',
  'charged-walls',
  'net-charges',
  // status
  'reconnecting',
];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split('\\').join('/'));
}

describe.each(THEME_IDS)('manifest: %s', (themeId) => {
  const theme = manifest.themes[themeId] as ThemeAssets;
  const artDir = join(appRoot, 'art', themeId);
  const files = walk(artDir);

  it('exists', () => {
    expect(theme).toBeDefined();
    expect(manifest.version).toBe(1);
  });

  it('covers every SVG outside review/ and icons/, and nothing else', () => {
    const svgs = files.filter(
      (f) => f.endsWith('.svg') && !f.startsWith('review/') && !f.startsWith('icons/'),
    );
    const named = Object.values(theme.frames).map((f) => f.file);
    expect(new Set(named).size).toBe(named.length);
    expect([...named].sort()).toEqual(svgs.sort());
  });

  it('names frames by their path under the category folder', () => {
    for (const [name, f] of Object.entries(theme.frames)) {
      expect(f.file, name).toBe(`${f.category}/${name}.svg`);
      expect(['ground', 'world', 'effects'], name).toContain(f.layer);
      expect(f.viewBox, name).toHaveLength(4);
      expect(f.anchor, name).toHaveLength(2);
      if (f.rig) {
        const parts = [f.rig.id, f.rig.view, ...(f.rig.pose ? [f.rig.pose] : []), f.rig.part];
        expect(name).toBe(parts.join('/'));
        expect(VIEW_IDS).toContain(f.rig.view);
      }
    }
  });

  it('lists every rig, and every rig has frames', () => {
    const rigFiles = files.filter((f) => /^rigs\/[^/]+\.json$/.test(f));
    expect([...theme.rigs].sort()).toEqual(rigFiles.map((f) => f.slice(5, -5)).sort());
    for (const rig of theme.rigs) {
      expect(
        Object.values(theme.frames).some((f) => f.rig?.id === rig),
        rig,
      ).toBe(true);
    }
  });

  it('carries tint, emissive and attach points from the rigs', () => {
    expect(theme.frames['warden/front/plume']?.tint).toBe(true);
    expect(theme.frames['warden/front/helm-glow']?.rig?.emissive).toBe(true);
    expect(theme.frames['ranger/front/ready/bow']?.rig).toMatchObject({
      view: 'front',
      pose: 'ready',
    });
    expect(Object.keys(theme.frames['warden/side/helm']?.attach ?? {}).sort()).toEqual([
      'badge',
      'nametag',
    ]);
    expect(theme.frames['pulse-turret/ii/se']?.attach?.['muzzle-2']).toBeDefined();
  });

  it('lists exactly the SPEC §2.6 icon ids, plus the badge tiles', () => {
    expect(new Set(SPEC_ICON_IDS).size).toBe(SPEC_ICON_IDS.length);
    expect([...theme.icons].sort()).toEqual([...SPEC_ICON_IDS].sort());
    expect([...theme.tiles].sort()).toEqual(['badge-tile', 'badge-tile-active']);
  });

  it('builds the icon sprite with a symbol per icon and the glow groups kept', () => {
    const sprite = readFileSync(join(appRoot, 'generated', theme.iconSprite), 'utf8');
    for (const id of [...theme.icons, ...theme.tiles]) {
      expect(sprite, id).toContain(`<symbol id="${ICON_SYMBOL_PREFIX}${id}" viewBox=`);
    }
    expect(sprite.match(/<symbol /g)).toHaveLength(theme.icons.length + theme.tiles.length);
    expect(sprite).toContain('class="glyph"');
    expect(sprite).toContain('class="glow"');
  });

  it('builds a portrait (body + tint mask) per class helm', () => {
    const classRigs = theme.icons.filter((i) => i.startsWith('class-')).map((i) => i.slice(6));
    expect(Object.keys(theme.portraits).sort()).toEqual(classRigs.sort());
    for (const [rig, p] of Object.entries(theme.portraits)) {
      const body = readFileSync(join(appRoot, 'generated', p.body), 'utf8');
      const mask = readFileSync(join(appRoot, 'generated', p.mask), 'utf8');
      expect(body, rig).toMatch(/^<svg [^>]*color="#ffffff"/);
      expect(mask, rig).toContain('<mask id=');
      expect(existsSync(join(appRoot, 'generated', p.body))).toBe(true);
    }
  });
});
