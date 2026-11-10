// Theme packs hold presentation only (SPEC §15.4): a theme object may not carry keys outside its type
// (a whitelist, so a gameplay field can't sneak in), and it covers every internal id.
import { describe, expect, it } from 'vitest';
import {
  CARD_IDS,
  CLASS_IDS,
  ENEMY_IDS,
  LANE_IDS,
  SHOP_ITEM_IDS,
  STRUCTURE_IDS,
} from '../../shared/ids';
import { neonKnightsHost } from '../neon-knights/host';
import { neonKnightsShared } from '../neon-knights/shared';

const keysOf = (o: object) => Object.keys(o).sort();

describe('theme key whitelist (neon knights)', () => {
  it('ThemeShared has only its own keys', () => {
    const allowed = ['id', 'defaultDifficulty', 'names', 'flavor', 'icons', 'iconFor', 'portraits'];
    for (const k of keysOf(neonKnightsShared)) expect(allowed, k).toContain(k);
    expect(keysOf(neonKnightsShared.icons)).toEqual(['ids', 'markup']);
    expect(keysOf(neonKnightsShared.iconFor)).toEqual([
      'card',
      'class',
      'main',
      'shop',
      'structure',
      'super',
    ]);
    for (const p of Object.values(neonKnightsShared.portraits))
      expect(keysOf(p)).toEqual(['body', 'color']);
  });

  it('ThemeHost has only its own keys', () => {
    const allowed = ['atlases', 'rigs', 'clips', 'rigFor', 'sfx', 'map'];
    for (const k of keysOf(neonKnightsHost)) expect(allowed, k).toContain(k);
    expect(keysOf(neonKnightsHost.rigFor)).toEqual(['class', 'enemy', 'soldier', 'structure']);
    for (const k of keysOf(neonKnightsHost.map))
      expect(['decor', 'edges', 'floorLift', 'ground', 'lanes'], k).toContain(k);
    for (const a of neonKnightsHost.atlases)
      expect(keysOf(a)).toEqual(['image', 'json', 'key', 'scale']);
    for (const r of Object.values(neonKnightsHost.rigs)) {
      for (const k of keysOf(r))
        expect(['id', 'optional', 'viewBox', 'views'], `${r.id}: ${k}`).toContain(k);
    }
    for (const c of Object.values(neonKnightsHost.clips))
      expect(keysOf(c)).toEqual(['durationMs', 'loop', 'tracks']);
  });

  it('names every internal id (SPEC §2.1 display names)', () => {
    const ids = [
      ...CLASS_IDS,
      ...ENEMY_IDS,
      ...STRUCTURE_IDS,
      ...SHOP_ITEM_IDS,
      ...CARD_IDS,
      'base',
      'faction',
    ];
    expect(keysOf(neonKnightsShared.names)).toEqual([...ids].sort());
    for (const id of ids)
      expect(
        neonKnightsShared.names[id as keyof typeof neonKnightsShared.names].length,
        id,
      ).toBeGreaterThan(0);
    expect(neonKnightsShared.names).toMatchObject({
      engineer: 'Ranger',
      quartermaster: 'Artificer',
      arrow_tower: 'Pulse turret',
      snare: 'Shock Net',
      grunt: 'Drone',
      swarm: 'Scrap mites',
      base: 'Citadel',
      faction: 'The Iron Tide',
      spiked_walls: 'Charged walls',
    });
  });

  it('maps internal ids to rigs (engineer → ranger, quartermaster → artificer, grunt → drone …)', () => {
    expect(neonKnightsHost.rigFor.class).toEqual({
      engineer: 'ranger',
      warden: 'warden',
      quartermaster: 'artificer',
      commander: 'commander',
    });
    expect(neonKnightsHost.rigFor.enemy).toMatchObject({
      grunt: 'drone',
      runner: 'skitter',
      swarm: 'mite',
      flyer: 'wasp',
      siege: 'bombard',
      hunter: 'stalker',
    });
    expect(neonKnightsHost.rigFor.soldier).toBe('footman');
    expect(keysOf(neonKnightsHost.map.lanes)).toEqual([...LANE_IDS].sort());
  });

  it('has 1× and 2× atlases with URLs, and portraits and the icon sprite', () => {
    expect(neonKnightsHost.atlases.map((a) => a.scale).sort()).toEqual([1, 2]);
    for (const a of neonKnightsHost.atlases) {
      expect(a.image).toMatch(/\.png/);
      expect(a.json).toMatch(/\.json/);
    }
    expect(neonKnightsShared.icons.ids).toContain('coins');
    expect(neonKnightsShared.icons.markup).toContain('<symbol id="icon-coins"');
    for (const p of Object.values(neonKnightsShared.portraits)) {
      // A URL, or a data: URL when Vite inlines the small SVG.
      expect(p.body).toMatch(/-body\.svg|^data:image\/svg\+xml/);
      expect(p.color).toMatch(/-mask\.svg|^data:image\/svg\+xml/);
    }
  });
});
