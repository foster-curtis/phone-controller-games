// Warden scenarios (SPEC §8, §10.1): the ground slam (tap, short arc, many enemies, lands after its
// wind-up), the aimed stomp (longer arc, damage and a brief stun), and Mason (walls near him repair in
// combat only, §5).
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { classes, grunt, warden } from '../../../content/balance';
import { groundBody, sectorHitsBody } from '../body';
import { aimPreview } from '../preview';
import { harness } from './harness';

// The tank's damage band multiplies the slam and the jump slam (§8.1).
const TANK = classes.find((c) => c.id === 'tank')!.damage;
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
    for (const e of front) expect(e.maxHp - e.hp).toBe(warden.main.damage * TANK);
    expect(behind.hp).toBe(behind.maxHp);
    expect(h.p(0).superCharge).toBeCloseTo(
      3 * (warden.main.damage * TANK) * warden.superCharge.perDamage,
      6,
    );
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
    // Outside the arc (down, not right); FF7-fix-2's longer stomp reached the old (12.5, 15).
    const far = h.sim.spawnEnemy('grunt', 10.5, 17); // RD3: the jump slam is as wide as the slam
    far.stats.moveSpeed = 0; // Holds still through the long wind-up (RC1).
    h.pads[0]!.tap('superFires', { superAim: { x: 1, y: 0 } });
    h.run(5);
    expect(near.hp).toBe(near.maxHp);
    h.p(0).superCharge = 1;
    h.pads[0]!.tap('superFires', { superAim: { x: 1, y: 0 } });
    h.run(1);
    expect(h.events('attack')).toEqual([expect.objectContaining({ slot: 'super' })]);
    expect(h.p(0).superCharge).toBe(0);
    h.run(steps(warden.super.windupMs));
    expect(near.maxHp - near.hp).toBe(warden.super.damage * TANK);
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
    // It walked up to him during the long wind-up (RC1): step away so it has somewhere to go.
    h.put(0, 18, 12);
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

describe('Warden jump slam wind-up (§8.2, RC1)', () => {
  const WIND = steps(warden.super.windupMs);

  function jumping() {
    const h = combat();
    h.put(0, 10, 12);
    const near = h.sim.spawnEnemy('grunt', 12.5, 12);
    h.p(0).superCharge = 1;
    h.pads[0]!.tap('superFires', { superAim: { x: 1, y: 0 } });
    h.run(1);
    return { h, near };
  }

  it('lands 1/2 to 2/3 of RC1’s 1.8 s after the press, with its damage and stun together', () => {
    expect(warden.super.windupMs).toBeGreaterThanOrEqual(1800 / 2);
    expect(warden.super.windupMs).toBeLessThanOrEqual((1800 * 2) / 3);
    const { h, near } = jumping();
    h.run(WIND - 1);
    expect(near.hp).toBe(near.maxHp);
    expect(near.effects.some((e) => e.def === 'stun')).toBe(false);
    h.run(1);
    expect(near.maxHp - near.hp).toBe(warden.super.damage * TANK);
    expect(near.effects.some((e) => e.def === 'stun')).toBe(true);
  });

  it('downed mid-jump: the slam never lands and the TV is told', () => {
    const { h, near } = jumping();
    h.run(30);
    h.p(0).hp = 0;
    h.run(1);
    expect(h.events('windupCancelled')).toEqual([
      { e: 'windupCancelled', source: h.p(0).id, slot: 'super' },
    ]);
    h.run(WIND);
    expect(near.hp).toBe(near.maxHp);
  });

  it('dazed mid-jump: the slam never lands, even after he reconnects', () => {
    const { h, near } = jumping();
    h.run(30);
    h.sim.command({ c: 'presence', slot: 0, connected: false });
    h.run(1);
    expect(h.events('windupCancelled')).toHaveLength(1);
    h.sim.command({ c: 'presence', slot: 0, connected: true });
    h.run(WIND);
    expect(near.hp).toBe(near.maxHp);
  });

  it('in the air he is rooted, keeps his aim, and main and build presses are lost', () => {
    const { h } = jumping();
    h.pads[0]!.set({ move: { x: 0, y: 1 } });
    h.pads[0]!.tap('mainFires');
    h.run(2);
    h.pads[0]!.tap('buildFires', { buildAim: { x: 1, y: 0 } });
    h.run(WIND - 6);
    expect(h.p(0).y).toBeCloseTo(12, 1);
    expect(h.p(0).facing).toBeCloseTo(0, 6);
    expect(h.p(0).main.queued).toBe(false);
    expect(h.sim.world.builds).toHaveLength(0);
    expect(h.p(0).meter).toBe(1);
    h.pads[0]!.set({ move: { x: 0, y: 0 } });
    expect(h.collect('attack', 12).filter((a) => a.source === h.p(0).id)).toEqual([]);
  });

  it('he can still be hit while airborne', () => {
    const { h } = jumping();
    const g = h.sim.spawnEnemy('grunt', 10, 12.7);
    let hit = false;
    for (let i = 0; i < WIND - 2 && !hit; i++) {
      h.run(1);
      hit = h.events('damage').some((d) => d.target === h.p(0).id && d.source === g.id);
    }
    expect(hit).toBe(true);
  });
});

describe('Warden slam reach and knockback (RC2)', () => {
  it('reaches 1.65× RC1’s 1.75 tiles, in the hit and in its aim preview', () => {
    const reach = 1.75 * 1.65;
    expect(warden.main.range).toBeCloseTo(reach, 2);
    const h = combat();
    h.put(0, 10, 12);
    const shape = aimPreview(h.p(0), warden, 'main', content.rules);
    expect(shape).toMatchObject({ kind: 'cone', range: warden.main.range });
    // A target past RC1's reach, inside the new one, is hit.
    const e = tough(h, 10 + reach - 0.1, 12);
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    h.run(1 + steps(warden.main.windupMs));
    expect(e.maxHp - e.hp).toBe(warden.main.damage * TANK);
  });

  it('knocks nothing back, stunned or not', () => {
    expect((warden.main as { knockback?: number }).knockback ?? 0).toBe(0);
    const h = combat();
    h.put(0, 10, 12);
    const e = tough(h, 11.2, 12);
    e.stats.moveSpeed = 0;
    const x = e.x;
    h.pads[0]!.tap('mainFires');
    h.run(1 + steps(warden.main.windupMs));
    expect(e.maxHp - e.hp).toBe(warden.main.damage * TANK);
    expect(e.push).toBeNull();
    expect(e.x).toBeCloseTo(x, 6);
  });

  it('damages a target that is already stunned without moving it', () => {
    const h = combat();
    h.put(0, 10, 12);
    const e = h.sim.spawnEnemy('grunt', 11.2, 12);
    h.p(0).superCharge = 1;
    h.pads[0]!.tap('superFires', { superAim: { x: 1, y: 0 } });
    h.run(1 + steps(warden.super.windupMs));
    expect(e.effects.some((x) => x.def === 'stun')).toBe(true);
    const hp = e.hp;
    const x = e.x;
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    h.run(1 + steps(warden.main.windupMs));
    expect(hp - e.hp).toBe(warden.main.damage * TANK);
    expect(e.push).toBeNull();
    expect(e.x).toBeCloseTo(x, 6);
  });
});

describe('Warden slam cone (RC2, RD3-fix-3)', () => {
  /** The slam's opening before RC2's narrower cone. */
  const OLD_ARC_DEG = 102;
  const DEG = Math.PI / 180;

  it('a third narrower than RC1, at the same 2.89-tile reach', () => {
    expect(warden.main.range).toBe(2.89);
    expect(warden.main.arcDeg / OLD_ARC_DEG).toBeCloseTo(2 / 3, 2);
  });

  it('misses a target just inside the old cone, hits one on the aim line at full reach; the aim preview is that cone', () => {
    const h = combat();
    h.put(0, 10, 12);
    const { x: px, y: py } = h.p(0);
    const reach = warden.main.range;
    // The TV's aim preview: the new cone, at the same reach.
    const shape = aimPreview(h.p(0), warden, 'main', content.rules);
    expect(shape).toEqual({ kind: 'cone', range: reach, half: (warden.main.arcDeg / 2) * DEG });
    const preview = shape as Extract<typeof shape, { kind: 'cone' }>;
    const still = (x: number, y: number) => {
      const e = tough(h, x, y);
      e.stats.moveSpeed = 0;
      return e;
    };
    // Aimed east. 45° off the aim, between the new half-angle (34°) and the old (51°), north of the
    // line: bodies reach north (−y) of their feet, so the body leans away from the cone.
    const ang = 45 * DEG;
    const d = reach - 0.4;
    const side = still(px + Math.cos(ang) * d, py - Math.sin(ang) * d);
    // 25° off the aim, well inside the preview's edge.
    const inner = still(px + Math.cos(25 * DEG) * d, py - Math.sin(25 * DEG) * d);
    const ahead = still(px + reach - 0.05, py);
    const body = groundBody(grunt.body!);
    const sec = (half: number) => ({ x: px, y: py, angle: 0, half, range: preview.range });
    // The old cone caught the side target, body and all; the previewed one doesn't.
    expect(sectorHitsBody(sec((OLD_ARC_DEG / 2) * DEG), side.x, side.y, body)).toBe(true);
    expect(sectorHitsBody(sec(preview.half), side.x, side.y, body)).toBe(false);
    expect(sectorHitsBody(sec(preview.half), inner.x, inner.y, body)).toBe(true);
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    h.run(1 + steps(warden.main.windupMs));
    // The slam lands exactly what the preview showed.
    expect(side.hp).toBe(side.maxHp);
    expect(inner.maxHp - inner.hp).toBe(warden.main.damage * TANK);
    expect(ahead.maxHp - ahead.hp).toBe(warden.main.damage * TANK);
  });
});
