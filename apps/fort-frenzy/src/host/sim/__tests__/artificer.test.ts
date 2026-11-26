// The Artificer's kit (SPEC §2.4, §6.1, §7.4, §8; RD8): the nanite blast, the heal cone, the healing
// beacon, what charges his super and his meter, and his cards' prerequisites.
import { describe, expect, it } from 'vitest';
import { content, type Content } from '../../../content';
import { artificer, beacon } from '../../../content/balance';
import type { CardId, ClassId } from '../../../shared/ids';
import { ATTACK_MS, BLAST_SHOT_MS } from '../../render/clips/artificer';
import { createCatalog } from '../catalog';
import { eligibleFor } from '../cards';
import { createSim } from '../index';
import { buildPreview } from '../preview';
import { resumeStart, takeSnapshot, type SnapshotMeta } from '../snapshot';
import type { BuildEnt, PlayerEnt } from '../types';
import { harness, type Harness } from './harness';

const steps = (ms: number) => Math.max(1, Math.round((ms * 60) / 1000));
const BURST = steps(artificer.main.burstMs);
const REGEN = steps(content.rules!.regen.delayMs);

type Pick = [slot: number, card: CardId, n?: number];

/** Content where his meter fills from nothing on its own, so only action fill moves it. */
const noPassiveFill: Content = {
  ...content,
  knights: content.knights.map((k) =>
    k.id === 'artificer' ? { ...k, meter: { ...k.meter, perSec: 0 } } : k,
  ),
};

function kit(classes: ClassId[], picks: Pick[] = [], seed = 7, c?: Content): Harness {
  const h = harness(classes.length, seed, { classes, content: c });
  h.toBuild();
  for (const [slot, card, n] of picks) h.give(slot, card, n ?? 1);
  h.toCombat();
  h.holdSpawns();
  return h;
}

/** Sets HP as if just hit, with delayed regen held off, so only the heals under test count. */
const hurt = (p: PlayerEnt, hp: number) => {
  p.hp = hp;
  p.regen.quietUntil = p.regen.nextRegen = 1e9;
};

interface Shot {
  tick: number;
  angle: number;
  speed: number;
}

/** Releases a blast along +x and records each nanite as it leaves. */
function blast(h: Harness, n = BURST + 10): Shot[] {
  const seen = new Map<number, Shot>();
  h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
  for (let i = 0; i < n; i++) {
    h.run(1);
    for (const b of h.sim.world.projectiles) {
      if (b.source !== h.p(0).id || seen.has(b.id)) continue;
      seen.set(b.id, {
        tick: h.sim.world.tick,
        angle: Math.atan2(b.vy, b.vx),
        speed: Math.hypot(b.vx, b.vy),
      });
    }
  }
  return [...seen.values()];
}

describe('nanite blast (§8.2)', () => {
  it('one release sends about 5 nanites, evenly over about 0.8 s', () => {
    const h = kit(['artificer']);
    h.put(0, 10, 12);
    const shots = blast(h);
    expect(artificer.main.count).toBe(5);
    expect(artificer.main.burstMs).toBe(800);
    expect(shots).toHaveLength(5);
    const first = shots[0]!.tick;
    expect(shots.map((s) => s.tick - first)).toEqual([0, 12, 24, 36, 48]);
  });

  it('keeps every nanite inside the narrow cone', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const h = kit(['artificer'], [], seed);
      h.put(0, 10, 12);
      const half = ((artificer.main.spreadDeg / 2) * Math.PI) / 180;
      for (const s of blast(h)) expect(Math.abs(s.angle)).toBeLessThanOrEqual(half + 1e-9);
    }
  });

  it('the same seed gives the same spread, another seed a different one', () => {
    const angles = (seed: number) => {
      const h = kit(['artificer'], [], seed);
      h.put(0, 10, 12);
      return blast(h).map((s) => s.angle);
    };
    expect(angles(11)).toEqual(angles(11));
    expect(angles(11)).not.toEqual(angles(12));
  });

  it('flies the aim he released with, even if he turns during the burst', () => {
    const h = kit(['artificer']);
    h.put(0, 10, 12);
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    h.run(2);
    h.pads[0]!.set({ move: { x: -1, y: 0 } });
    const half = ((artificer.main.spreadDeg / 2) * Math.PI) / 180;
    for (let i = 0; i < BURST + 2; i++) {
      h.run(1);
      for (const b of h.sim.world.projectiles)
        expect(Math.abs(Math.atan2(b.vy, b.vx))).toBeLessThanOrEqual(half + 1e-9);
    }
  });

  it('one burst per release: a release during it waits for the cooldown', () => {
    const h = kit(['artificer']);
    h.put(0, 10, 12);
    const cooldown = steps(artificer.main.cooldownMs);
    const seen = new Map<number, number>();
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    for (let i = 0; i < cooldown + BURST + 10; i++) {
      // A second release mid-burst queues; it doesn't add shots to this one.
      if (i === 10) h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
      h.run(1);
      for (const b of h.sim.world.projectiles)
        if (b.source === h.p(0).id && !seen.has(b.id)) seen.set(b.id, h.sim.world.tick);
    }
    const ticks = [...seen.values()];
    expect(ticks).toHaveLength(2 * artificer.main.count);
    expect(ticks[artificer.main.count]! - ticks[0]!).toBe(cooldown);
  });

  it('the cooldown never drops under the burst, however fast he attacks', () => {
    expect(artificer.main.cooldownMs).toBeGreaterThanOrEqual(800);
    const h = kit(['artificer'], [[0, 'haste', 10]]);
    h.put(0, 10, 12);
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    h.run(1);
    const left = h.p(0).main.readyAt - h.sim.world.tick;
    expect(left).toBeGreaterThanOrEqual(BURST - 1);
    expect(left).toBeLessThanOrEqual(BURST);
  });

  it('going dazed drops the nanites not yet fired', () => {
    const h = kit(['artificer']);
    h.put(0, 10, 12);
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    h.run(14);
    expect(h.p(0).burst!.fired).toBeLessThan(artificer.main.count);
    const known = new Set(h.sim.world.projectiles.map((b) => b.id));
    h.p(0).connected = false;
    h.run(1);
    expect(h.p(0).burst).toBeNull();
    h.p(0).connected = true;
    for (let i = 0; i < BURST; i++) {
      h.run(1);
      for (const b of h.sim.world.projectiles) expect(known.has(b.id)).toBe(true);
    }
  });

  it('its damage charges the super and the meter', () => {
    const h = kit(['artificer'], [], 7, noPassiveFill);
    h.put(0, 10, 12);
    h.p(0).meter = 0;
    const e = h.sim.spawnEnemy('grunt', 12.5, 12);
    e.hp = e.maxHp = 1e6;
    e.stats.moveSpeed = 0;
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    h.run(BURST + 30);
    expect(e.hp).toBeLessThan(1e6);
    expect(h.p(0).superCharge).toBeGreaterThan(0);
    expect(h.p(0).meter).toBeGreaterThan(0);
  });

  it('the TV clip kicks on the same beat as the nanites', () => {
    expect(BLAST_SHOT_MS * (artificer.main.count - 1)).toBe(artificer.main.burstMs);
    expect(ATTACK_MS).toBeGreaterThan(artificer.main.burstMs);
  });
});

describe('regen (RC1): firing restarts the 5 s wait', () => {
  it('every nanite restarts it, so it runs from the last one', () => {
    const h = kit(['artificer']);
    h.put(0, 10, 12);
    const p = h.p(0);
    p.hp = 50;
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    h.run(1);
    const afterFirst = p.regen.quietUntil;
    h.run(BURST);
    expect(p.burst).toBeNull();
    expect(p.regen.quietUntil).toBe(afterFirst + BURST);
    h.until(() => h.sim.world.tick >= p.regen.quietUntil - 2);
    expect(p.hp).toBe(50);
    h.run(4);
    expect(p.hp).toBeGreaterThan(50);
  });

  it('the heal cone restarts it', () => {
    const h = kit(['artificer']);
    h.put(0, 10, 12);
    const p = h.p(0);
    p.hp = 50;
    p.superCharge = 1;
    const t = h.sim.world.tick;
    h.pads[0]!.tap('superFires', { superAim: { x: 1, y: 0 } });
    h.run(1);
    const healed = 50 + artificer.super.heal;
    expect(p.hp).toBe(healed);
    expect(p.regen.quietUntil).toBeGreaterThanOrEqual(t + REGEN);
    h.until(() => h.sim.world.tick >= p.regen.quietUntil - 2);
    expect(p.hp).toBe(healed);
    h.run(4);
    expect(p.hp).toBeGreaterThan(healed);
  });

  it('placing the beacon does not restart it', () => {
    const h = kit(['artificer']);
    h.put(0, 10, 12);
    const p = h.p(0);
    p.hp = 50;
    p.regen.quietUntil = p.regen.nextRegen = h.sim.world.tick + 30;
    const q = p.regen.quietUntil;
    h.pads[0]!.tap('buildFires', { buildAim: { x: 1, y: 0 } });
    h.run(2);
    expect(h.sim.world.builds).toHaveLength(1);
    expect(p.regen.quietUntil).toBe(q);
  });
});

describe('heal cone (§8.2)', () => {
  it('heals him and the knights in the cone; not soldiers, not builds, not knights behind him', () => {
    const h = kit(['artificer', 'ranger', 'ranger', 'commander'], [], 7, noPassiveFill);
    h.put(0, 10, 12);
    h.put(1, 14, 12);
    h.put(2, 5, 12);
    h.put(3, 25, 20);
    for (const slot of [0, 1, 2]) hurt(h.p(slot), 40);
    const soldier = h.sim.world.soldiers[0]!;
    soldier.x = 12;
    soldier.y = 12;
    soldier.hp = 10;
    const build = h.sim.addBuild('shield_gen', 12, 12.5, 1);
    build.hp -= 50;
    h.p(0).meter = 0.5;
    h.p(0).superCharge = 1;
    h.pads[0]!.tap('superFires', { superAim: { x: 1, y: 0 } });
    h.run(1);
    expect(h.p(0).hp).toBe(40 + artificer.super.heal);
    expect(h.p(1).hp).toBe(40 + artificer.super.heal);
    expect(h.p(2).hp).toBe(40);
    expect(soldier.hp).toBe(10);
    expect(build.hp).toBe(build.maxHp - 50);
    // Its healing charges neither his super nor his meter (§7.2).
    expect(h.p(0).superCharge).toBe(0);
    expect(h.p(0).meter).toBe(0.5);
  });
});

/** A live beacon of slot 0's at (x, y). */
const liveBeacon = (h: Harness, x: number, y: number): BuildEnt =>
  h.sim.addBuild('beacon', x, y, 0);

describe('healing beacon (§7.4)', () => {
  it('is thrown with a full meter, empties it and switches on', () => {
    const h = kit(['artificer']);
    h.put(0, 10, 12);
    h.pads[0]!.tap('buildFires', { buildAim: { x: 1, y: 0 } });
    h.run(1);
    const b = h.sim.world.builds[0]!;
    expect(b.kind).toBe('beacon');
    expect(b.state).toBe('flight');
    expect(b.hp).toBe(beacon.hp);
    expect(h.p(0).meter).toBeLessThan(0.01);
    h.until(() => b.state === 'active', 120);
  });

  it('pulses in combat, healing knights in its radius only (not soldiers or builds)', () => {
    const h = kit(['artificer', 'ranger', 'commander']);
    h.put(0, 30, 20);
    h.put(1, 11, 12);
    h.put(2, 25, 6);
    hurt(h.p(1), 40);
    hurt(h.p(0), 40);
    const soldier = h.sim.world.soldiers[0]!;
    soldier.x = 10.5;
    soldier.y = 12;
    soldier.hp = 10;
    soldier.stats.moveSpeed = 0;
    const other = h.sim.addBuild('shield_gen', 10.5, 12.5, 1);
    other.hp -= 50;
    liveBeacon(h, 10, 12);
    h.run(1);
    expect(h.p(1).hp).toBe(40 + beacon.heal.amount);
    h.run(steps(beacon.heal.everyMs));
    expect(h.p(1).hp).toBe(40 + 2 * beacon.heal.amount);
    expect(h.p(0).hp).toBe(40);
    expect(soldier.hp).toBe(10);
    expect(other.hp).toBe(other.maxHp - 50);
  });

  it('stands idle in the build phase', () => {
    const h = kit(['artificer', 'ranger']);
    h.put(1, 11, 12);
    liveBeacon(h, 10, 12);
    h.sim.world.spawns.length = 0;
    h.until(() => h.sim.world.phase === 'build', 10);
    hurt(h.p(1), 40);
    h.run(180);
    expect(h.p(1).hp).toBe(40);
  });

  it('its healing charges the super, never the meter', () => {
    const h = kit(['artificer', 'ranger'], [], 7, noPassiveFill);
    h.put(0, 30, 20);
    h.put(1, 11, 12);
    hurt(h.p(1), 40);
    h.p(0).meter = 0.25;
    liveBeacon(h, 10, 12);
    h.run(steps(beacon.heal.everyMs) + 1);
    const healed = 2 * beacon.heal.amount;
    expect(h.p(1).hp).toBe(40 + healed);
    expect(h.p(0).superCharge).toBeCloseTo(healed * artificer.superCharge.perHeal, 9);
    expect(h.p(0).meter).toBe(0.25);
  });

  it('Focus speeds up the super charge from healing', () => {
    const h = kit(['artificer', 'ranger'], [[0, 'focus']]);
    h.put(0, 30, 20);
    h.put(1, 11, 12);
    hurt(h.p(1), 40);
    liveBeacon(h, 10, 12);
    h.run(1);
    expect(h.p(0).superCharge).toBeCloseTo(
      beacon.heal.amount * artificer.superCharge.perHeal * 1.15,
      9,
    );
  });

  it('keeps working while its owner is dazed', () => {
    const h = kit(['artificer', 'ranger']);
    h.put(1, 11, 12);
    hurt(h.p(1), 40);
    liveBeacon(h, 10, 12);
    h.p(0).connected = false;
    h.run(1);
    expect(h.p(1).hp).toBe(40 + beacon.heal.amount);
  });

  it('Booster Beacon heals more per pulse and has more HP', () => {
    const h = kit(['artificer', 'ranger'], [[0, 'booster_beacon']]);
    h.put(0, 10, 12);
    h.put(1, 11, 12);
    hurt(h.p(1), 40);
    h.pads[0]!.tap('buildFires', { buildAim: { x: 0, y: 0 } });
    h.run(1);
    const b = h.sim.world.builds[0]!;
    expect(b.maxHp).toBeCloseTo(beacon.hp * 1.3, 9);
    h.until(() => b.state === 'active' && h.p(1).hp > 40, 120);
    expect(h.p(1).hp).toBeCloseTo(40 + beacon.heal.amount * 1.3, 9);
  });

  it('a boosted beacon keeps its HP through a resume', () => {
    const h = kit(['artificer'], [[0, 'booster_beacon']]);
    h.put(0, 10, 12);
    h.pads[0]!.tap('buildFires', { buildAim: { x: 0, y: 0 } });
    h.run(1);
    const b = h.sim.world.builds[0]!;
    b.hp = beacon.hp * 1.3 - 20;
    h.sim.world.spawns.length = 0;
    h.until(() => h.sim.world.phase === 'build', 10);
    const meta: SnapshotMeta = {
      savedAt: 1_000_000,
      build: 'test',
      runMs: 1000,
      leaderKey: 'key-0',
      ids: (slot) => ({ playerKey: `key-${slot}`, deviceId: `dev-${slot}` }),
    };
    const snap = takeSnapshot(h.sim.world, content, meta);
    const r = createSim(
      resumeStart(snap, () => true),
      { content },
    ).world.builds[0]!;
    expect(r.maxHp).toBeCloseTo(beacon.hp * 1.3, 9);
    expect(r.hp).toBeCloseTo(beacon.hp * 1.3 - 20, 9);
  });

  it('Strong Arm throws it further and faster', () => {
    const flight = (picks: Pick[]) => {
      const h = kit(['artificer'], picks);
      h.put(0, 10, 12);
      h.pads[0]!.set({ buildAiming: true, buildAim: { x: 1, y: 0 } });
      h.run(1);
      const range = buildPreview(h.p(0), content)!.range;
      h.pads[0]!.tap('buildFires', { buildAiming: false });
      h.run(1);
      const f = h.sim.world.builds[0]!.flight!;
      return { range, to: f.to.x, steps: f.landsAt - f.launchedAt };
    };
    const base = flight([]);
    const strong = flight([[0, 'strong_arm']]);
    expect(base.range).toBe(beacon.throw.range);
    expect(strong.range).toBeCloseTo(beacon.throw.range * 1.25, 9);
    expect(strong.to).toBeCloseTo(10 + beacon.throw.range * 1.25, 9);
    // 25% further at 25% more speed: the same flight time, so the throw covers more ground in it.
    expect(strong.steps).toBeLessThanOrEqual(base.steps);
  });
});

describe('his meter (§7.2)', () => {
  it('fills on its own in combat, and from Field Medic healing', () => {
    const alone = kit(['artificer']);
    alone.p(0).meter = 0;
    alone.run(60);
    expect(alone.p(0).meter).toBeCloseTo(artificer.meter.perSec, 2);

    const h = kit(['artificer', 'ranger'], [[0, 'field_medic']], 7, noPassiveFill);
    h.put(0, 10, 12);
    h.put(1, 11, 12);
    hurt(h.p(1), 40);
    h.p(0).meter = 0;
    h.run(61);
    expect(h.p(1).hp).toBeGreaterThan(40);
    expect(h.p(0).meter).toBeCloseTo((h.p(1).hp - 40) * artificer.meter.perPoint, 9);
  });
});

describe('his cards (§6.1)', () => {
  const offered = (owned: CardId[], card: CardId) => {
    const h = harness(1, 1, { classes: ['artificer'] });
    h.toBuild();
    const p = h.p(0);
    p.cards = Object.fromEntries(owned.map((id) => [id, 1]));
    const eligible = eligibleFor(createCatalog(content, 'normal'), h.sim.world, p);
    return eligible(content.cards.find((c) => c.id === card)!);
  };

  it('Field Medic is his rare, unique passive card', () => {
    const def = content.cards.find((c) => c.id === 'field_medic')!;
    expect(def).toMatchObject({ owner: 'artificer', tier: 'rare', unique: true });
    expect(artificer.passiveCard).toBe('field_medic');
    expect('passive' in artificer).toBe(false);
    expect(offered([], 'field_medic')).toBe(true);
    expect(offered(['field_medic'], 'field_medic')).toBe(false);
  });

  it('Wide Aura requires Field Medic', () => {
    expect(offered([], 'wide_aura')).toBe(false);
    expect(offered(['field_medic'], 'wide_aura')).toBe(true);
  });

  it('Plague requires Venom Bolts and Field Medic', () => {
    expect(content.cards.find((c) => c.id === 'plague')!.requires).toEqual([
      'venom_bolts',
      'field_medic',
    ]);
    expect(offered([], 'plague')).toBe(false);
    expect(offered(['venom_bolts'], 'plague')).toBe(false);
    expect(offered(['field_medic'], 'plague')).toBe(false);
    expect(offered(['venom_bolts', 'wide_aura'], 'plague')).toBe(false);
    expect(offered(['venom_bolts', 'field_medic'], 'plague')).toBe(true);
  });
});
