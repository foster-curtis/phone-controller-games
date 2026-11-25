// The catalog entry (SPEC §4, PLATFORM decision #9): passes the catalog's own validation, including
// the card and share art and the web manifest name, and matches the scope in SPEC §6.1.
import { checkCatalog } from '@pcg/catalog/node';
import { describe, expect, it } from 'vitest';
import meta, { maxPlayers, minPlayers, title } from '../../../game.meta';

describe('game.meta.ts', () => {
  it('passes catalog validation', () => {
    expect(checkCatalog([meta])).toEqual([]);
  });

  it('matches SPEC §4 and §6.1', () => {
    expect(meta.id).toBe('thieves-forum');
    expect(title).toBe("Thieves' Forum");
    expect([minPlayers, maxPlayers]).toEqual([2, 8]);
    expect(meta.status).toBe('hidden');
  });
});
