// The presentation holds presentation only (SPEC §15.4): its objects may not carry keys outside their type
// (a whitelist, so a gameplay field can't sneak in), and it covers every internal id.
import { describe, expect, it } from 'vitest';
import {
  BUILD_IDS,
  CARD_IDS,
  CLASS_IDS,
  ENEMY_IDS,
  ROLE_IDS,
  SHOP_ITEM_IDS,
  SIDE_IDS,
} from '../../shared/ids';
import { presentationHost } from '../host';
import { presentationShared } from '../shared';

const keysOf = (o: object) => Object.keys(o).sort();

describe('presentation key whitelist', () => {
  it('PresentationShared has only its own keys', () => {
    const allowed = ['names', 'flavor', 'icons', 'iconFor', 'portraits'];
    for (const k of keysOf(presentationShared)) expect(allowed, k).toContain(k);
    expect(keysOf(presentationShared.icons)).toEqual(['ids', 'markup']);
    expect(keysOf(presentationShared.iconFor)).toEqual([
      'build',
      'card',
      'knight',
      'main',
      'role',
      'shop',
      'super',
    ]);
    for (const p of Object.values(presentationShared.portraits))
      expect(keysOf(p)).toEqual(['body', 'color']);
  });

  it('PresentationHost has only its own keys', () => {
    const allowed = ['atlases', 'rigs', 'clips', 'rigFor', 'sfx', 'map'];
    for (const k of keysOf(presentationHost)) expect(allowed, k).toContain(k);
    expect(keysOf(presentationHost.rigFor)).toEqual(['enemy', 'knight', 'soldier']);
    for (const k of keysOf(presentationHost.map))
      expect(['decor', 'edges', 'floorLift', 'ground', 'portals'], k).toContain(k);
    for (const a of presentationHost.atlases)
      expect(keysOf(a)).toEqual(['image', 'json', 'key', 'scale']);
    for (const r of Object.values(presentationHost.rigs)) {
      for (const k of keysOf(r))
        expect(['id', 'optional', 'viewBox', 'views'], `${r.id}: ${k}`).toContain(k);
    }
    for (const c of Object.values(presentationHost.clips))
      expect(keysOf(c)).toEqual(['durationMs', 'loop', 'tracks']);
  });

  it('names every internal id (SPEC §2.1 display names)', () => {
    const ids = [
      ...CLASS_IDS,
      ...ROLE_IDS,
      ...ENEMY_IDS,
      ...BUILD_IDS,
      ...SHOP_ITEM_IDS,
      ...CARD_IDS,
      'base',
      'faction',
    ];
    expect(keysOf(presentationShared.names)).toEqual([...ids].sort());
    for (const id of ids)
      expect(
        presentationShared.names[id as keyof typeof presentationShared.names].length,
        id,
      ).toBeGreaterThan(0);
    expect(presentationShared.names).toMatchObject({
      ranger: 'Ranger',
      artificer: 'Artificer',
      shield_gen: 'Shield generator',
      tank: 'Tank',
      grunt: 'Drone',
      swarm: 'Scrap mites',
      base: 'Citadel',
      faction: 'The Iron Tide',
      base_hp: 'Citadel max HP',
    });
  });

  it('maps enemy ids to rigs (grunt → drone …; knights use their class ids as rig ids)', () => {
    expect(presentationHost.rigFor.enemy).toMatchObject({
      grunt: 'drone',
      runner: 'skitter',
      swarm: 'mite',
      flyer: 'wasp',
      siege: 'bombard',
      hunter: 'stalker',
    });
    expect(presentationHost.rigFor.soldier).toBe('footman');
    expect(keysOf(presentationHost.map.portals)).toEqual([...SIDE_IDS].sort());
    expect(presentationShared.iconFor.build).toEqual({
      shield_gen: 'act-shield',
      mine: 'act-mine',
      beacon: 'act-beacon',
      rally_flag: 'act-flag',
    });
  });

  it('has 1× and 2× atlases with URLs, and portraits and the icon sprite', () => {
    expect(presentationHost.atlases.map((a) => a.scale).sort()).toEqual([1, 2]);
    for (const a of presentationHost.atlases) {
      expect(a.image).toMatch(/\.png/);
      expect(a.json).toMatch(/\.json/);
    }
    expect(presentationShared.icons.ids).toContain('coins');
    expect(presentationShared.icons.markup).toContain('<symbol id="icon-coins"');
    for (const p of Object.values(presentationShared.portraits)) {
      // A URL, or a data: URL when Vite inlines the small SVG.
      expect(p.body).toMatch(/-body\.svg|^data:image\/svg\+xml/);
      expect(p.color).toMatch(/-mask\.svg|^data:image\/svg\+xml/);
    }
  });
});
