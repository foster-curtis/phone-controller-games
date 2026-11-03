// Warden scenarios (SPEC §8, §10.1): the ground slam (tap, short arc, many enemies, lands after its
// wind-up), the aimed stomp (longer arc, damage and a brief stun), and Mason (walls near him repair in
// combat only, §5).
import { describe, expect, it } from 'vitest';
import { warden } from '../../../content/characters';
import { harness } from './harness';

const steps = (ms: number) => Math.max(1, Math.round((ms * 60) / 1000));

function combat() {
  const h = harness(1, 1, { classes: ['warden'] });
  h.toCombat();
  h.holdSpawns();
  return h;
}

function tough(h: ReturnType<typeof combat>, x: number, y: number) {
  const e = h.sim.spawnEnemy('grunt', x, y);
  e.hp = e.maxHp = 1e6;
  return e;
}

describe('Warden slam', () => {
  it('a tap auto-aims and, after the wind-up, hits every enemy in the arc in front', () => {
    const h = combat();
    h.put(0, 10, 12);
    const front = [tough(h, 11.2, 12), tough(h, 11, 12.7), tough(h, 11, 11.3)];
    const behind = tough(h, 8.7, 12);
    h.pads[0]!.tap('mainFires');
    h.run(1);
    expect(h.events('attack')).toEqual([expect.objectContaining({ slot: 'main' })]);
    expect(h.p(0).main.windupEndsAt).not.toBeNull();
    // Nothing lands during the wind-up, and he is rooted.
    h.pads[0]!.set({ move: { x: 1, y: 0 } });
    h.run(steps(warden.main.windupMs) - 1);
    for (const e of front) expect(e.hp).toBe(e.maxHp);
    expect(h.p(0).x).toBeCloseTo(10, 1);
    h.run(1);
    for (const e of front) expect(e.maxHp - e.hp).toBe(warden.main.damage);
    expect(behind.hp).toBe(behind.maxHp);
    expect(h.p(0).superCharge).toBeCloseTo(3 * warden.main.damage * warden.superChargeRate, 6);
  });

  it('dying during the wind-up calls it off', () => {
    const h = combat();
    h.put(0, 10, 12);
    const e = tough(h, 11.2, 12);
    h.pads[0]!.tap('mainFires');
    h.run(1);
    h.p(0).hp = 0;
    h.run(steps(warden.main.windupMs) + 2);
    expect(e.hp).toBe(e.maxHp);
  });
});

describe('Warden stomp', () => {
  it('needs a full charge, then hits the longer aimed arc and stuns briefly', () => {
    const h = combat();
    h.put(0, 10, 12);
    // Plain Grunts: a stun refreshes stats, which resets an inflated max HP.
    const near = h.sim.spawnEnemy('grunt', 12.5, 12);
    const far = h.sim.spawnEnemy('grunt', 12.5, 15); // outside the arc (down, not right)
    h.pads[0]!.tap('superFires', { superAim: { x: 1, y: 0 } });
    h.run(5);
    expect(near.hp).toBe(near.maxHp);
    h.p(0).superCharge = 1;
    h.pads[0]!.tap('superFires', { superAim: { x: 1, y: 0 } });
    h.run(1);
    expect(h.events('attack')).toEqual([expect.objectContaining({ slot: 'super' })]);
    expect(h.p(0).superCharge).toBe(0);
    h.run(steps(warden.super.windupMs));
    expect(near.maxHp - near.hp).toBe(warden.super.damage);
    expect(far.hp).toBe(far.maxHp);
    expect(near.effects.map((e) => e.def)).toContain('stun');
    // Stunned: no walking and no swings.
    const x = near.x;
    h.run(steps(1000));
    expect(near.x).toBeCloseTo(x, 3);
    expect(near.attack.windupEndsAt).toBeNull();
    // It wears off.
    h.run(steps(warden.super.effects[0]!.durationMs));
    expect(near.effects.some((e) => e.def === 'stun')).toBe(false);
    h.run(30);
    expect(Math.abs(near.x - x) + Math.abs(near.y - 12)).toBeGreaterThan(0.05);
  });

  it('its own damage does not charge the super', () => {
    const h = combat();
    h.put(0, 10, 12);
    tough(h, 12, 12);
    h.p(0).superCharge = 1;
    h.pads[0]!.tap('superFires', { superAim: { x: 1, y: 0 } });
    h.run(steps(warden.super.windupMs) + 2);
    expect(h.p(0).superCharge).toBe(0);
  });
});

describe('Mason', () => {
  it('repairs walls near the Warden in combat, never far ones', () => {
    const h = combat();
    h.put(0, 10.5, 12.5);
    const near = h.sim.place('wall', 11, 13, 0);
    const far = h.sim.place('wall', 20, 13, 0);
    near.hp = far.hp = 100;
    h.run(60);
    expect(near.hp).toBeCloseTo(100 + 10, 0);
    expect(far.hp).toBe(100);
    near.hp = near.maxHp - 1;
    h.run(60);
    expect(near.hp).toBe(near.maxHp);
  });

  it('is off during the build phase', () => {
    const h = harness(1, 1, { classes: ['warden'] });
    h.toBuild();
    h.put(0, 10.5, 12.5);
    const near = h.sim.place('wall', 11, 13, 0);
    near.hp = 100;
    h.run(120);
    expect(h.sim.world.phase).toBe('build');
    expect(near.hp).toBe(100);
  });

  it('is off while he is down', () => {
    const h = combat();
    h.put(0, 10.5, 12.5);
    const near = h.sim.place('wall', 11, 13, 0);
    near.hp = 100;
    h.p(0).hp = 0;
    h.run(60);
    expect(near.hp).toBe(100);
  });
});
