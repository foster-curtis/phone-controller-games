// Disguise invariant (SPEC §6.11, §12.3): `CharacterView` has no player-identifying field.
import { describe, expect, expectTypeOf, it } from 'vitest';
import { CHARACTER_VIEW_KEYS, type CharacterView } from '../snapshot';

const sample: CharacterView = {
  id: 7,
  rig: 'citizen',
  outfit: { tunic: 'olive', mantle: 'linen', hair: 0, skin: 3 },
  pose: 'walk',
  x: 12,
  y: 15.5,
  facing: 0,
  gait: 'walk',
};

describe('CharacterView', () => {
  it('has no playerId, isPlayer or controller key (type)', () => {
    expectTypeOf<CharacterView>().not.toHaveProperty('playerId');
    expectTypeOf<CharacterView>().not.toHaveProperty('isPlayer');
    expectTypeOf<CharacterView>().not.toHaveProperty('controller');
    expectTypeOf<CharacterView>().not.toHaveProperty('control');
    expectTypeOf<CharacterView>().not.toHaveProperty('side');
    expectTypeOf<keyof CharacterView>().toEqualTypeOf<(typeof CHARACTER_VIEW_KEYS)[number]>();
  });

  it('a sample has exactly the allowlisted keys', () => {
    expect(Object.keys(sample).sort()).toEqual([...CHARACTER_VIEW_KEYS].sort());
    for (const banned of ['playerId', 'isPlayer', 'controller', 'control', 'side', 'name', 'color'])
      expect(CHARACTER_VIEW_KEYS as readonly string[]).not.toContain(banned);
  });
});
