// Content and render agree on straight-shot speeds (BUILD_PLAN §8 FF3-fix-1, FF7): every shot drawn
// as a bolt (the Ranger's longbow, the pulse turret, the base sentries) flies at PROJECTILE_SPEEDS.bolt.
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { SLAM_IMPACT_MS, STOMP_IMPACT_MS } from '../render/clips/warden';
import { PROJECTILE_SPEEDS } from '../render/effectsMath';

describe('projectile speeds', () => {
  it('bolts fly at the render speed', () => {
    const engineer = content.characters.find((c) => c.id === 'engineer')!;
    const tower = content.structures.find((s) => s.id === 'arrow_tower')!;
    // The longbow shares the bolt look but is slower since 0fbe288; the render draws the sim's speed.
    expect(engineer.main.speed).toBeLessThanOrEqual(PROJECTILE_SPEEDS.bolt);
    expect(tower.attack!.speed).toBe(PROJECTILE_SPEEDS.bolt);
    expect(content.base!.archers.attack.speed).toBe(PROJECTILE_SPEEDS.bolt);
  });
});

describe('Warden wind-ups (FF8)', () => {
  it('the slam and the stomp land on their clips’ impact frames', () => {
    const warden = content.characters.find((c) => c.id === 'warden')!;
    expect(warden.main.windupMs).toBe(SLAM_IMPACT_MS);
    expect(warden.super.windupMs).toBe(STOMP_IMPACT_MS);
  });
});
