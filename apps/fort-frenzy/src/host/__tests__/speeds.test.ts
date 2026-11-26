// Content and render agree on straight-shot speeds (BUILD_PLAN §8 FF3-fix-1, FF7): every shot drawn
// as a bolt (the Ranger's longbow, the base sentries) flies at PROJECTILE_SPEEDS.bolt.
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { THROW_SPEED } from '../../content/balance';
import { SLAM_IMPACT_MS, STOMP_IMPACT_MS } from '../render/clips/warden';
import { PROJECTILE_SPEEDS } from '../render/effectsMath';

describe('projectile speeds', () => {
  it('bolts fly at the render speed', () => {
    const ranger = content.knights.find((c) => c.id === 'ranger')!;
    // The longbow shares the bolt look but is slower since 0fbe288; the render draws the sim's speed.
    expect(ranger.main.speed).toBeLessThanOrEqual(PROJECTILE_SPEEDS.bolt);
    expect(content.base!.archers.attack.speed).toBe(PROJECTILE_SPEEDS.bolt);
  });
});

describe('Warden wind-ups (FF8)', () => {
  it('the slam and the stomp land on their clips’ impact frames', () => {
    const warden = content.knights.find((c) => c.id === 'warden')!;
    expect(warden.main.windupMs).toBe(SLAM_IMPACT_MS);
    expect(warden.super.windupMs).toBe(STOMP_IMPACT_MS);
    // RC2: the jump slam lands in 1/2 to 2/3 of RC1's 1.8 s wind-up.
    expect(STOMP_IMPACT_MS).toBeGreaterThanOrEqual(1800 / 2);
    expect(STOMP_IMPACT_MS).toBeLessThanOrEqual((1800 * 2) / 3);
  });
});

describe('throw speeds (RC2)', () => {
  it('every thrown thing flies at one shared base speed, a little slower than RC1’s generator', () => {
    const thrown = content.builds.filter((b) => b.throw);
    expect(thrown.map((b) => b.id).sort()).toEqual(['beacon', 'rally_flag', 'shield_gen']);
    const soldier = content.knights.find((c) => c.id === 'commander')!.super.spawn!;
    for (const b of thrown) expect(b.throw!.speed, b.id).toBe(THROW_SPEED);
    expect(soldier.throwSpeed).toBe(THROW_SPEED);
    expect(THROW_SPEED).toBeLessThan(6);
  });
});
