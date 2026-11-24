// RC2 notes on enemy aggro (RD10-fix-1; SPEC §9 "Who attacks what", §8.4): a leashed enemy goes on
// toward the base from where it stands, never back to the point it left its way; the Commander's
// soldiers are aggro targets like knights (radius, leash, nearest wins) and die at 0 HP.
import { describe, expect, it } from 'vitest';
import type { ClassId } from '../../../shared/ids';
import type { BuildEnt, SimEvent, SoldierEnt } from '../types';
import { harness, type Harness } from './harness';

/** Combat with nothing spawning, no sentries, players parked in the top corners. */
function arena(classes: ClassId[] = ['ranger']): Harness {
  const h = harness(classes.length, 3, { classes });
  h.toCombat();
  h.holdSpawns();
  h.sim.world.base.archers.count = 0;
  h.sim.world.players.forEach((p, i) => h.put(p.slot, i % 2 === 0 ? 1 : 35, 1 + i * 0.5));
  return h;
}

/** The real rally flag (RD9) at (x, y), with the Commander (slot 0) sent far away afterwards. */
function flagAt(h: Harness, x: number, y: number): BuildEnt {
  h.put(0, x, y);
  h.p(0).meter = 1;
  h.pads[0]!.tap('buildFires');
  h.run(1);
  const flag = h.sim.world.builds.find((b) => b.kind === 'rally_flag')!;
  h.until(() => flag.state !== 'flight', 120);
  h.put(0, 34, 22);
  h.run(90); // the squad takes its ring round the flag
  return flag;
}

describe('aggro leash: on toward the base from where it stands (RC2 note 1)', () => {
  for (const kind of ['grunt', 'swarm', 'brute', 'flyer'] as const) {
    it(`${kind}: pulled off its way then leashed, it never heads back to where it left`, () => {
      const h = arena();
      const p = h.p(0);
      const e = h.sim.spawnEnemy(kind, 10.5, 14.5);
      h.put(0, 9.6, 14.5);
      h.until(() => e.ai === 'aggro', 60);
      expect(e.target).toBe(p.id);
      const from = { ...e.leashFrom! };
      // Lure it across its way (the base is up and to the right), far enough that it never gets
      // in reach, so the leash ends the chase.
      h.put(0, 0.5, 9);
      h.until(() => e.ai !== 'aggro', 60 * 10);
      expect(e.target === null || e.target === -1).toBe(true);
      expect(e.leashFrom).toBeNull();
      const at = { x: e.x, y: e.y };
      const left = Math.hypot(at.x - from.x, at.y - from.y);
      expect(left).toBeGreaterThan(3);
      let near = Infinity;
      const toBase0 = Math.hypot(at.x - 18, at.y - 1);
      for (let i = 0; i < 240; i++) {
        h.run(1);
        expect(e.ai).not.toBe('return');
        expect(e.ai).not.toBe('aggro');
        near = Math.min(near, Math.hypot(e.x - from.x, e.y - from.y));
      }
      // The old walk back reached `from`; on toward the base it passes well clear of it.
      expect(near).toBeGreaterThan(1.5);
      expect(Math.hypot(e.x - 18, e.y - 1)).toBeLessThan(toBase0 - 1);
    });
  }

  it('a knight it let go at the leash stays ignored while near, and is taken again once he left', () => {
    const h = arena();
    const p = h.p(0);
    const e = h.sim.spawnEnemy('grunt', 10.5, 14.5);
    h.put(0, 9.6, 14.5);
    h.until(() => e.ai === 'aggro', 60);
    // Past the leash with him still beside it.
    e.leashFrom = { x: e.x + 20, y: e.y };
    h.until(() => e.ai !== 'aggro', 60); // a swing in progress finishes first
    expect(e.ai).toBe('path');
    expect(e.dropped).toBe(p.id);
    for (let i = 0; i < 60; i++) {
      h.put(0, e.x - 1, e.y);
      h.run(1);
      expect(e.ai).not.toBe('aggro');
    }
    h.put(0, 34, 22);
    h.run(1);
    expect(e.dropped).toBeUndefined();
    h.put(0, e.x - 1, e.y);
    h.until(() => e.ai === 'aggro', 5);
    expect(e.target).toBe(p.id);
  });

  it('a target that goes down is let go from where it stands too', () => {
    const h = arena();
    const e = h.sim.spawnEnemy('grunt', 10.5, 14.5);
    h.put(0, 9.6, 14.5);
    h.until(() => e.ai === 'aggro', 60);
    h.sim.command({ c: 'presence', slot: 0, connected: false });
    h.run(2);
    expect(e.ai).toBe('path');
    expect(e.leashFrom).toBeNull();
    expect(e.dropped).toBeUndefined();
  });
});

describe("the Commander's soldiers are aggro targets (RC2 note 2)", () => {
  const damageTo = (evs: SimEvent[], src: number, target: number) =>
    evs.filter((d) => d.e === 'damage' && d.source === src && d.target === target).length;

  for (const kind of ['grunt', 'swarm', 'brute', 'flyer'] as const) {
    it(`${kind}: with a soldier in aggro range and no knight near, it attacks and damages it`, () => {
      const h = arena(['commander']);
      flagAt(h, 14, 18);
      const ids = new Set(h.sim.world.soldiers.map((u) => u.id));
      expect(ids.size).toBeGreaterThan(0);
      const e = h.sim.spawnEnemy(kind, 14, 15.6);
      e.hp = 1e6; // the squad fights back; keep it standing for the test
      let hits = 0;
      for (let i = 0; i < 60 * 6 && hits === 0; i++) {
        h.run(1);
        for (const id of ids) hits += damageTo(h.sim.world.events, e.id, id);
      }
      expect(hits).toBeGreaterThan(0);
      expect(e.target === null || ids.has(e.target)).toBe(true);
    });
  }

  it('a soldier at 0 HP dies and is removed (no respawn)', () => {
    const h = arena(['commander']);
    flagAt(h, 14, 18);
    const e = h.sim.spawnEnemy('grunt', 14, 15.6);
    e.hp = 1e6;
    h.until(() => e.ai === 'aggro', 120);
    const u = h.sim.world.soldiers.find((x) => x.id === e.target)!;
    expect(u).toBeDefined();
    u.hp = 1;
    const deaths: SimEvent[] = [];
    for (let i = 0; i < 60 * 5 && h.sim.world.soldiers.includes(u); i++) {
      h.run(1);
      deaths.push(...h.events('death'));
    }
    expect(h.sim.world.soldiers).not.toContain(u);
    expect(deaths).toContainEqual(
      expect.objectContaining({ e: 'death', id: u.id, what: 'soldier', killer: e.id }),
    );
    h.run(120);
    expect(h.sim.world.soldiers.some((x) => x.id === u.id)).toBe(false);
  });

  it('a nearer knight wins over a soldier, and a nearer soldier over a knight', () => {
    const h = arena(['commander', 'ranger']);
    flagAt(h, 14, 18);
    const u = h.sim.world.soldiers[0] as SoldierEnt;
    const e = h.sim.spawnEnemy('grunt', 20, 12);
    for (const x of h.sim.world.soldiers) if (x !== u) x.hp = 0;
    h.run(1);
    // Soldier 1.2 tiles off, the Ranger 2 tiles off: the soldier.
    u.x = e.x + 1.2;
    u.y = e.y;
    h.put(1, e.x - 2, e.y);
    h.run(1);
    expect(e.target).toBe(u.id);
    // Then the Ranger 0.8 tiles off: a knight nearer than the soldier wins.
    const f = h.sim.spawnEnemy('grunt', 26, 12);
    u.x = f.x + 1.6;
    u.y = f.y;
    h.put(1, f.x - 0.8, f.y);
    h.run(1);
    expect(f.target).toBe(h.p(1).id);
  });

  it('a soldier in the air is not a target until it lands', () => {
    const h = arena(['commander']);
    flagAt(h, 14, 18);
    const [u, ...rest] = h.sim.world.soldiers as SoldierEnt[];
    for (const x of rest) x.hp = 0;
    h.run(1);
    const e = h.sim.spawnEnemy('grunt', 25, 12);
    const t = h.sim.world.tick;
    const put = () => {
      u!.x = e.x + 1;
      u!.y = e.y;
    };
    u!.flight = {
      from: { x: e.x + 1, y: e.y },
      to: { x: e.x + 1, y: e.y },
      launchedAt: t,
      landsAt: t + 30,
    };
    for (let i = 0; i < 25; i++) {
      put();
      h.run(1);
      expect(e.target).not.toBe(u!.id);
    }
    h.until(() => u!.flight === null, 10);
    h.until(() => e.target === u!.id, 10);
  });

  it("Siege shells a soldier in range like a knight (the players' rank)", () => {
    const h = arena(['commander']);
    flagAt(h, 14, 18);
    const [u, ...rest] = h.sim.world.soldiers as SoldierEnt[];
    for (const x of rest) x.hp = 0;
    h.run(1);
    const s = h.sim.spawnEnemy('siege', 20, 12);
    let picked: number | null = null;
    for (let i = 0; i < 60 && picked === null; i++) {
      u!.x = 20 - 4;
      u!.y = 12;
      h.run(1);
      if (h.sim.world.markers.some((m) => m.source === s.id)) picked = s.target;
    }
    expect(picked).toBe(u!.id);
  });
});
