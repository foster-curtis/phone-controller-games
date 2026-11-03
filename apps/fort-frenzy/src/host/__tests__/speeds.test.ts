// Content and render agree on straight-shot speeds (BUILD_PLAN §8 FF3-fix-1, FF7): every shot drawn
// as a bolt (the Ranger's longbow, the pulse turret, the base sentries) flies at PROJECTILE_SPEEDS.bolt.
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { PROJECTILE_SPEEDS } from '../render/effectsMath';

describe('projectile speeds', () => {
  it('bolts fly at the render speed', () => {
    const engineer = content.characters.find((c) => c.id === 'engineer')!;
    const tower = content.structures.find((s) => s.id === 'arrow_tower')!;
    expect(engineer.main.speed).toBe(PROJECTILE_SPEEDS.bolt);
    expect(tower.attack!.speed).toBe(PROJECTILE_SPEEDS.bolt);
    expect(content.base!.archers.attack.speed).toBe(PROJECTILE_SPEEDS.bolt);
  });
});
