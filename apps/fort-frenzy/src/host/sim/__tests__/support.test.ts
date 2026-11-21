// Support knights (SPEC §8; BUILD_PLAN FF9): the Artificer's Field Medic and nanite cone; the
// Commander's slash, morale, Lead from the Front, rally flag and squad.
import { describe, expect, it } from 'vitest';
import { content as baseContent, type Content } from '../../../content';
import { commander, artificer } from '../../../content/balance';
import type { ClassId, PlayerColorId } from '../../../shared/ids';
import { PLAYER_COLOR_IDS } from '../../../shared/ids';
import { createSim, ScriptedInputSource, squadSize, type Sim } from '../index';
import type { PlayerEnt, SimEvent, SoldierEnt } from '../types';

function mixed(classes: ClassId[], content: Content = baseContent) {
  const pads = classes.map(() => new ScriptedInputSource());
  const sim: Sim = createSim(
    {
      seed: 7,
      settings: { difficulty: 'normal' },
      slots: classes.map((classId, i) => ({
        slot: i,
        name: `P${i + 1}`,
        color: PLAYER_COLOR_IDS[i] as PlayerColorId,
        classId,
        connected: true,
      })),
    },
    { sources: new Map(pads.map((p, i) => [i, p] as const)), content },
  );
  const h = {
    sim,
    pads,
    p: (slot: number) => sim.world.players.find((p) => p.slot === slot)!,
    run(n: number) {
      for (let i = 0; i < n; i++) sim.step();
    },
    until(pred: () => boolean, max = 60 * 60) {
      for (let i = 0; i < max; i++) {
        if (pred()) return i;
        sim.step();
      }
      if (!pred()) throw new Error(`until: not reached (phase ${sim.world.phase})`);
      return max;
    },
    toBuild() {
      h.until(() => sim.world.phase === 'build');
    },
    toCombat() {
      if (sim.world.phase === 'countdown') h.toBuild();
      for (const p of sim.world.players) sim.command({ c: 'ready', slot: p.slot, ready: true });
      h.until(() => sim.world.phase === 'combat', 5);
      for (const s of sim.world.spawns) s.atTick += 1e7;
    },
    put(slot: number, x: number, y: number) {
      const p = h.p(slot);
      p.x = x;
      p.y = y;
    },
    collect<K extends SimEvent['e']>(kind: K, n: number): Extract<SimEvent, { e: K }>[] {
      const out: SimEvent[] = [];
      for (let i = 0; i < n; i++) {
        sim.step();
        out.push(...sim.world.events.filter((e) => e.e === kind));
      }
      return out as never;
    },
    squad: (slot: number): SoldierEnt[] => sim.world.soldiers.filter((u) => u.owner === slot),
  };
  return h;
}

const hurt = (p: PlayerEnt, hp: number) => {
  p.hp = hp;
};

describe('Field Medic (§8)', () => {
  it('is off in the build phase', () => {
    const h = mixed(['artificer', 'ranger']);
    h.toBuild();
    h.put(0, 10, 10);
    h.put(1, 11, 10);
    hurt(h.p(1), 50);
    h.run(180);
    expect(h.p(1).hp).toBe(50);
  });

  it('heals nearby players in combat and charges the super slowly', () => {
    const h = mixed(['artificer', 'ranger']);
    h.toCombat();
    h.put(0, 10, 10);
    h.put(1, 11, 10);
    hurt(h.p(1), 50);
    const heals = h.collect('heal', 181);
    expect(h.p(1).hp).toBe(50 + 3 * 3);
    expect(heals.every((e) => e.source === h.p(0).id)).toBe(true);
    const params = artificer.passive!.params;
    expect(h.p(0).superCharge).toBeCloseTo(9 * params.chargeRate, 9);
    expect(params.chargeRate).toBeLessThan(artificer.superCharge.perDamage);
  });

  it('leaves players out of its radius alone', () => {
    const h = mixed(['artificer', 'ranger']);
    h.toCombat();
    h.put(0, 10, 10);
    h.put(1, 16, 10);
    hurt(h.p(1), 50);
    h.run(180);
    expect(h.p(1).hp).toBe(50);
  });
});

describe('Artificer attacks (§8)', () => {
  it('main bolts fan out and hit; the super cone heals knights only (§8.2)', () => {
    const h = mixed(['artificer', 'ranger']);
    h.toCombat();
    h.sim.world.spawns.length = 0;
    h.put(0, 10.5, 10.5);
    h.put(1, 15.5, 10.5);
    const enemy = h.sim.spawnEnemy('grunt', 13.5, 10.5);
    enemy.stats.moveSpeed = 0;
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    h.run(1);
    const bolts = h.sim.world.projectiles.filter((p) => p.from === 'artificer');
    expect(bolts).toHaveLength(artificer.main.count);
    expect(new Set(bolts.map((b) => Math.round(Math.atan2(b.vy, b.vx) * 100))).size).toBe(4);
    const hits = h.collect('damage', 40).filter((d) => d.target === enemy.id);
    expect(hits.some((d) => d.source === h.p(0).id)).toBe(true);

    hurt(h.p(1), 30);
    const build = h.sim.addBuild('beacon', 12.5, 10.5, 1);
    build.hp -= 50;
    h.p(0).superCharge = 1;
    h.pads[0]!.tap('superFires', { superAim: { x: 1, y: 0 } });
    h.run(1);
    expect(h.p(1).hp).toBe(30 + artificer.super.heal);
    // Builds aren't healed, and nothing in the cone gets a buff.
    expect(build.hp).toBe(build.maxHp - 50);
    expect(build.effects).toHaveLength(0);
  });

  it("the super's healing doesn't charge the super", () => {
    const h = mixed(['artificer', 'ranger', 'ranger']);
    h.toCombat();
    h.put(0, 10, 10);
    h.put(1, 14, 10);
    h.put(2, 14, 11);
    hurt(h.p(1), 20);
    hurt(h.p(2), 20);
    h.p(0).superCharge = 1;
    h.pads[0]!.tap('superFires', { superAim: { x: 1, y: 0 } });
    const heals = h.collect('heal', 2);
    expect(heals.length).toBeGreaterThanOrEqual(2);
    expect(h.p(0).run.healingDone).toBeGreaterThanOrEqual(2 * artificer.super.heal);
    expect(h.p(0).superCharge).toBe(0);
  });
});

describe('Commander (§8)', () => {
  it('slashes every enemy in the arc in front of him, not behind', () => {
    const h = mixed(['commander']);
    h.toCombat();
    h.put(0, 10, 10);
    const front = h.sim.spawnEnemy('grunt', 11, 10.3);
    const back = h.sim.spawnEnemy('grunt', 9, 10);
    h.p(0).facing = 0;
    const [f0, b0] = [front.hp, back.hp];
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    h.run(1);
    expect(front.hp).toBeLessThan(f0);
    expect(back.hp).toBe(b0);
  });

  it('starts with 2 soldiers that follow him', () => {
    const h = mixed(['commander']);
    h.toBuild();
    expect(h.squad(0)).toHaveLength(2);
    expect(h.squad(0).map((u) => u.index)).toEqual([0, 1]);
    h.toCombat();
    h.put(0, 10, 12);
    h.run(240);
    for (const u of h.squad(0)) expect(Math.hypot(u.x - 10, u.y - 12)).toBeLessThan(2.2);
  });

  it('soldiers attack enemies near their post', () => {
    const h = mixed(['commander']);
    h.toCombat();
    h.put(0, 10, 12);
    h.run(200);
    const e = h.sim.spawnEnemy('grunt', 10, 14);
    const hp0 = e.hp;
    const hits = h.collect('attack', 120).filter((a) => h.squad(0).some((u) => u.id === a.source));
    expect(hits.length).toBeGreaterThan(0);
    expect(e.hp).toBeLessThan(hp0);
  });

  it('dead soldiers collapse and return at the next build phase', () => {
    const h = mixed(['commander']);
    h.toCombat();
    const victim = h.squad(0)[1]!;
    victim.hp = 0;
    const deaths = h.collect('death', 1);
    expect(deaths).toEqual([
      { e: 'death', id: victim.id, what: 'soldier', killer: null, x: victim.x, y: victim.y },
    ]);
    expect(h.squad(0).map((u) => u.index)).toEqual([0]);
    // Clear the wave: back to build, the fallen soldier returns at the base.
    h.sim.world.spawns.length = 0;
    h.until(() => h.sim.world.phase === 'build', 10);
    expect(
      h
        .squad(0)
        .map((u) => u.index)
        .sort(),
    ).toEqual([0, 1]);
    const back = h.squad(0).find((u) => u.index === 1)!;
    expect(back.y).toBeLessThan(5);
    expect(back.hp).toBe(commander.squad.soldier.hp);
  });

  it('the squad keeps its starting size through the run (RD9 adds Reinforcements)', () => {
    expect(squadSize(commander.squad)).toBe(2);
    const h = mixed(['commander']);
    h.toBuild();
    expect(h.squad(0)).toHaveLength(2);
    h.sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: 11 });
    h.run(1);
    expect(h.squad(0)).toHaveLength(2);
    expect(h.squad(0).map((u) => u.index)).toEqual([0, 1]);
  });

  it('morale: squad and Commander hit harder and faster, he also runs faster', () => {
    const h = mixed(['commander']);
    h.toCombat();
    h.put(0, 10, 12);
    h.run(120);
    const speed0 = h.p(0).stats.moveSpeed;
    h.p(0).superCharge = 1;
    h.pads[0]!.tap('superFires');
    h.run(2);
    expect(
      h
        .p(0)
        .effects.map((e) => e.def)
        .sort(),
    ).toEqual(['haste', 'morale']);
    for (const u of h.squad(0)) expect(u.effects.map((e) => e.def)).toContain('morale');
    expect(h.p(0).stats.moveSpeed).toBeCloseTo(speed0 * 1.25, 6);
    // Morale runs out.
    h.run(Math.ceil((6000 / 1000) * 60) + 2);
    expect(h.p(0).effects.some((e) => e.def === 'morale')).toBe(false);
    expect(h.p(0).stats.moveSpeed).toBeCloseTo(speed0, 6);
  });

  it('Lead from the Front: soldiers near him deal more damage, far ones do not', () => {
    const h = mixed(['commander']);
    h.toCombat();
    h.put(0, 10, 12);
    h.run(120);
    const near = h.squad(0)[0]!;
    expect(near.effects.map((e) => e.def)).toContain('aura_lead_from_the_front');
    // Walk far away; the aura lapses.
    h.put(0, 30, 20);
    h.p(0).flag = { x: 10, y: 12 };
    for (const u of h.squad(0)) u.mode = 'rally';
    h.run(30);
    expect(near.effects.some((e) => e.def === 'aura_lead_from_the_front')).toBe(false);
  });
});
