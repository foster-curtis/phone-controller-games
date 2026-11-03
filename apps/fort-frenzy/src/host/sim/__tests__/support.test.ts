// Support classes (SPEC §6, §8, §10.1 rows 3, 6, 7; BUILD_PLAN FF9): the Quartermaster's supply perks,
// throws, emergency kit, Field Medic and nanite cone; the Commander's slash, morale, Lead from the
// Front, rally flag and squad.
import { describe, expect, it } from 'vitest';
import { content as baseContent, type Content } from '../../../content';
import { commander, quartermaster } from '../../../content/characters';
import type { WaveDef } from '../../../content/types';
import type { ClassId, PlayerColorId } from '../../../shared/ids';
import { PLAYER_COLOR_IDS } from '../../../shared/ids';
import { createSim, ScriptedInputSource, squadSize, type Sim } from '../index';
import type { PlayerEnt, SimEvent, SoldierEnt } from '../types';

const REPAIR = { x: 18, y: 2.5 };
const DEPOT = { x: 22.5, y: 1.5 };

function mixed(classes: ClassId[], content: Content = baseContent) {
  const pads = classes.map(() => new ScriptedInputSource());
  const sim: Sim = createSim(
    {
      seed: 7,
      settings: { theme: 'neon-knights', difficulty: 'normal' },
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

describe('Quartermaster supply perks (§6)', () => {
  it('buys crates at a discount, carries 8 with no slowdown', () => {
    const h = mixed(['quartermaster']);
    h.toBuild();
    h.sim.world.team.coins = 100;
    h.put(0, DEPOT.x, DEPOT.y);
    for (let i = 0; i < 10; i++) {
      h.pads[0]!.tap('actionTaps');
      h.run(1);
    }
    expect(h.p(0).crates).toBe(quartermaster.carryCap);
    // Price 2 at a 50% discount: 1 coin each.
    expect(h.sim.world.team.coins).toBe(100 - 8);

    const speed = (n: number) => {
      const g = mixed(['quartermaster']);
      g.toBuild();
      g.put(0, 4, 10);
      g.p(0).crates = n;
      g.pads[0]!.set({ move: { x: 1, y: 0 } });
      g.run(60);
      return g.p(0).x - 4;
    };
    expect(speed(8)).toBeCloseTo(speed(0), 6);
  });

  it('throws a crate to the nearest Engineer; it lands on the target', () => {
    const h = mixed(['quartermaster', 'engineer', 'engineer']);
    h.toCombat();
    h.put(0, 10, 10);
    h.put(1, 14, 10); // 4 tiles
    h.put(2, 16, 12); // farther
    h.p(0).crates = 2;
    h.pads[0]!.tap('actionTaps');
    h.run(1);
    const c = h.sim.world.thrown![0]!;
    expect(c).toBeDefined();
    expect(c.to).toBe(1);
    expect(h.p(0).crates).toBe(1);
    // The target walks on during the flight; the crate follows and lands on them.
    h.pads[1]!.set({ move: { x: 0, y: 1 } });
    let landedAt: { x: number; y: number } | null = null;
    h.until(() => {
      const t = h.sim.world.thrown!.find((x) => x.id === c.id);
      if (t) landedAt = { x: t.x, y: t.y };
      return !t;
    }, 120);
    expect(h.p(1).crates).toBe(1);
    // Its last landing point was the receiver (one step's walk behind at most).
    expect(landedAt!.x).toBeCloseTo(h.p(1).x, 1);
    expect(Math.abs(landedAt!.y - h.p(1).y)).toBeLessThan(0.1);
    expect(h.sim.world.cratePiles).toHaveLength(0);
  });

  it('no Engineer or Warden in reach: the action button does nothing (Give stays on hold)', () => {
    const h = mixed(['quartermaster', 'commander']);
    h.toCombat();
    h.put(0, 10, 10);
    h.put(1, 11, 10);
    h.p(0).crates = 2;
    h.pads[0]!.tap('actionTaps');
    h.run(1);
    expect(h.sim.world.thrown).toHaveLength(0);
    expect(h.p(0).crates).toBe(2);
  });

  it('a throw whose receiver went down drops where it lands', () => {
    const h = mixed(['quartermaster', 'engineer']);
    h.toCombat();
    h.put(0, 10, 10);
    h.put(1, 15, 10);
    h.p(0).crates = 1;
    h.pads[0]!.tap('actionTaps');
    h.run(1);
    h.p(1).hp = 0;
    h.until(() => h.sim.world.thrown!.length === 0, 120);
    expect(h.sim.world.cratePiles.reduce((n, p) => n + p.n, 0)).toBe(1);
  });

  it('the emergency kit repairs the base and is consumed, in either phase', () => {
    for (const phase of ['build', 'combat'] as const) {
      const h = mixed(['quartermaster']);
      if (phase === 'build') h.toBuild();
      else h.toCombat();
      const b = h.sim.world.base;
      b.hp = b.maxHp - 400;
      h.p(0).kits = 1;
      h.put(0, REPAIR.x, REPAIR.y);
      h.pads[0]!.tap('actionTaps');
      const used = h.collect('kitUsed', 1);
      expect(used).toEqual([{ e: 'kitUsed', slot: 0 }]);
      expect(h.p(0).kits).toBe(0);
      expect(b.hp).toBe(b.maxHp - 400 + quartermaster.supply.kitRepair);
      // No kit left: nothing more happens.
      h.pads[0]!.tap('actionTaps');
      expect(h.collect('kitUsed', 1)).toHaveLength(0);
    }
  });

  it('a crate in hand is delivered first (row 2 before row 3)', () => {
    const h = mixed(['quartermaster']);
    h.toBuild();
    const b = h.sim.world.base;
    b.hp = b.maxHp - 400;
    h.p(0).kits = 1;
    h.p(0).crates = 1;
    h.put(0, REPAIR.x, REPAIR.y);
    h.pads[0]!.tap('actionTaps');
    h.run(1);
    expect(h.p(0).crates).toBe(0);
    expect(h.p(0).kits).toBe(1);
  });
});

describe('Field Medic (§8)', () => {
  it('is off in the build phase', () => {
    const h = mixed(['quartermaster', 'engineer']);
    h.toBuild();
    h.put(0, 10, 10);
    h.put(1, 11, 10);
    hurt(h.p(1), 50);
    h.run(180);
    expect(h.p(1).hp).toBe(50);
  });

  it('heals nearby players in combat and charges the super slowly', () => {
    const h = mixed(['quartermaster', 'engineer']);
    h.toCombat();
    h.put(0, 10, 10);
    h.put(1, 11, 10);
    hurt(h.p(1), 50);
    const heals = h.collect('heal', 181);
    expect(h.p(1).hp).toBe(50 + 3 * 3);
    expect(heals.every((e) => e.source === h.p(0).id)).toBe(true);
    const params = quartermaster.passive.params;
    expect(h.p(0).superCharge).toBeCloseTo(9 * params.chargeRate, 9);
    expect(params.chargeRate).toBeLessThan(quartermaster.superChargeRate);
  });

  it('leaves players out of its radius alone', () => {
    const h = mixed(['quartermaster', 'engineer']);
    h.toCombat();
    h.put(0, 10, 10);
    h.put(1, 16, 10);
    hurt(h.p(1), 50);
    h.run(180);
    expect(h.p(1).hp).toBe(50);
  });
});

describe('Quartermaster attacks (§8)', () => {
  it('main bolts fan out and are blocked by towers; the super cone passes through and heals', () => {
    const h = mixed(['quartermaster', 'engineer']);
    h.toCombat();
    h.put(0, 10.5, 10.5);
    h.put(1, 15.5, 10.5);
    // A tower right in front of the Quartermaster, between him and the Engineer.
    h.sim.place('arrow_tower', 12, 10, 1);
    const enemy = h.sim.spawnEnemy('grunt', 14.5, 10.5);
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    h.run(1);
    const bolts = h.sim.world.projectiles.filter((p) => p.from === 'quartermaster');
    expect(bolts).toHaveLength(quartermaster.main.count);
    expect(new Set(bolts.map((b) => Math.round(Math.atan2(b.vy, b.vx) * 100))).size).toBe(4);
    // The tower shoots the enemy too; none of the Quartermaster's bolts reach it.
    const hits = h.collect('damage', 40).filter((d) => d.target === enemy.id);
    expect(hits.some((d) => d.source === h.p(0).id)).toBe(false);
    expect(h.sim.world.projectiles.filter((p) => p.from === 'quartermaster')).toHaveLength(0);

    hurt(h.p(1), 30);
    h.p(0).superCharge = 1;
    h.pads[0]!.tap('superFires', { superAim: { x: 1, y: 0 } });
    h.run(1);
    expect(h.p(1).hp).toBe(30 + quartermaster.super.heal);
    // The tower in the cone got the defense bonus.
    const tower = h.sim.world.structures[0]!;
    expect(tower.effects.map((e) => e.def)).toContain('tower_defense');
    h.run(1);
    expect(tower.stats.damageReduction).toBeCloseTo(0.3, 9);
  });

  it("the super's healing doesn't charge the super", () => {
    const h = mixed(['quartermaster', 'engineer', 'engineer']);
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
    expect(h.p(0).run.healingDone).toBeGreaterThanOrEqual(2 * quartermaster.super.heal);
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

  it('starts with 3 soldiers that follow him; the flag makes them hold it; recall brings them back', () => {
    const h = mixed(['commander']);
    h.toBuild();
    expect(h.squad(0)).toHaveLength(3);
    expect(h.squad(0).map((u) => u.index)).toEqual([0, 1, 2]);
    h.toCombat();
    h.put(0, 10, 12);
    h.run(240);
    for (const u of h.squad(0)) expect(Math.hypot(u.x - 10, u.y - 12)).toBeLessThan(2.2);

    // Plant: the flag stays where he stood; he walks away; they hold the flag.
    h.pads[0]!.tap('actionTaps');
    const plant = h.collect('flag', 1);
    expect(plant).toEqual([{ e: 'flag', slot: 0, action: 'plant' }]);
    expect(h.p(0).flag).toEqual({ x: 10, y: 12 });
    expect(h.squad(0).every((u) => u.mode === 'rally')).toBe(true);
    h.pads[0]!.set({ move: { x: 1, y: 0 } });
    h.run(90);
    h.pads[0]!.set({ move: { x: 0, y: 0 } });
    h.run(120);
    expect(h.p(0).x).toBeGreaterThan(15);
    for (const u of h.squad(0)) expect(Math.hypot(u.x - 10, u.y - 12)).toBeLessThan(1.3);

    // Recall: they follow him again.
    h.pads[0]!.tap('actionTaps');
    expect(h.collect('flag', 1)[0]!.action).toBe('recall');
    expect(h.p(0).flag).toBeNull();
    h.run(240);
    for (const u of h.squad(0)) {
      expect(u.mode).toBe('follow');
      expect(Math.hypot(u.x - h.p(0).x, u.y - h.p(0).y)).toBeLessThan(2.2);
    }
  });

  it('the flag is planted only in combat (build phase rows 1–4)', () => {
    const h = mixed(['commander']);
    h.toBuild();
    h.pads[0]!.tap('actionTaps');
    h.run(2);
    expect(h.p(0).flag).toBeNull();
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
    expect(h.squad(0).map((u) => u.index)).toEqual([0, 2]);
    // Clear the wave: back to build, the fallen soldier returns at the base.
    h.sim.world.spawns.length = 0;
    h.until(() => h.sim.world.phase === 'build', 10);
    expect(h.squad(0).map((u) => u.index).sort()).toEqual([0, 1, 2]);
    const back = h.squad(0).find((u) => u.index === 1)!;
    expect(back.y).toBeLessThan(5);
    expect(back.hp).toBe(commander.squad.soldier.hp);
  });

  it('the squad grows to 4 after the wave 5 boss and to 5 after the wave 10 boss (wave data)', () => {
    const waves: WaveDef[] = Array.from({ length: 12 }, (_, i) => ({
      n: i + 1,
      budget: 1,
      allowed: ['grunt'],
      lanes: ['bottom'],
      guaranteed: [],
      durationMs: 1000,
      ...(i + 1 === 5 || i + 1 === 10 ? { boss: { id: 'grunt' as const, mk: 1 as const } } : {}),
    }));
    const sizes = commander.squad.size;
    expect([1, 5, 6, 10, 11, 12].map((n) => squadSize(waves, sizes, n))).toEqual([
      3, 3, 4, 4, 5, 5,
    ]);
    const h = mixed(['commander'], { ...baseContent, waves });
    h.toBuild();
    expect(h.squad(0)).toHaveLength(3);
    h.sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: 6 });
    h.run(1);
    expect(h.squad(0)).toHaveLength(4);
    h.sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: 11 });
    h.run(1);
    expect(h.squad(0)).toHaveLength(5);
    expect(h.squad(0).map((u) => u.index)).toEqual([0, 1, 2, 3, 4]);
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
    expect(h.p(0).effects.map((e) => e.def).sort()).toEqual(['haste', 'morale']);
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

describe('Give for classes with no structures (§10.1)', () => {
  it('a Give commit (radial slot down) hands a crate over for the Quartermaster and Commander', () => {
    const h = mixed(['quartermaster', 'commander', 'engineer']);
    h.toCombat();
    h.put(0, 10, 10);
    h.put(1, 11, 10);
    h.put(2, 20, 20);
    h.p(0).crates = 3;
    h.p(1).crates = 1;
    h.pads[0]!.tap('radialCommits', { radialSlot: 3 });
    h.pads[1]!.tap('radialCommits', { radialSlot: 3 });
    const gives = h.collect('crate', 1);
    expect(gives.map((g) => [g.action, g.slot, g.to])).toEqual([
      ['give', 0, 1],
      ['give', 1, 0],
    ]);
  });
});
