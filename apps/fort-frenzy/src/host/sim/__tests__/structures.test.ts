// Structure scenarios (FF8): walls reroute or get smashed (§7, §15.5, breaker field), the flow field
// rebuilds the step a wall dies; shock nets (§7.1: discharges, rearm, strongest slow, half strength on
// Brutes, flyers and players untouched, lasting across waves, fizzling with no rebuild); placement on
// occupied tiles; Fortify only on towers (§8); the mortar's arcing shell and blast (§7.2, §8).
import { describe, expect, it } from 'vitest';
import { content as baseContent, type Content } from '../../../content';
import { bombTower, fortify, snare, wall } from '../../../content/balance';
import type { EnemyDef } from '../../../content/types';
import { placementValid } from '../index';
import { effects } from '../registry';
import { harness } from './harness';

const COLS = 36;

/** Test-only enemies (FF10 owns the real ones): a breaker Brute, a Swarm mite and a Flyer. */
const brute: EnemyDef = {
  id: 'brute',
  hp: 400,
  speed: 1.0,
  radius: 0.45,
  flying: false,
  // Bodies flat at the feet, so these scenarios keep FF8's circle hits (C4 bodies are body.test's).
  body: { radius: 0.45, bottom: 0, top: 0 },
  budget: 4,
  ai: 'path',
  field: 'breaker',
  attack: {
    shape: 'arc',
    damage: 30,
    range: 0.5,
    cooldownMs: 1200,
    windupMs: 250,
    arcDeg: 90,
    hitsFlyers: false,
  },
  vsStructure: { wall: 2 },
  slowResist: 0.5,
};
const swarm: EnemyDef = {
  id: 'swarm',
  hp: 20,
  speed: 1.6,
  radius: 0.14,
  flying: false,
  body: { radius: 0.14, bottom: 0, top: 0 },
  budget: 2,
  groupSize: 6,
  ai: 'path',
  field: 'ground',
  attack: { shape: 'arc', damage: 3, range: 0.3, cooldownMs: 800, hitsFlyers: false },
};
const flyer: EnemyDef = {
  ...swarm,
  id: 'flyer',
  radius: 0.3,
  flying: true,
  body: { radius: 0.3, bottom: 0, top: 0 },
  field: 'none',
  ai: 'flyer',
};
// Stand-ins replace content's own, so these scenarios don't move with FF10's tuning.
const STAND_INS = new Set(['brute', 'swarm', 'flyer']);
const content: Content = {
  ...baseContent,
  enemies: [...baseContent.enemies.filter((e) => !STAND_INS.has(e.id)), brute, swarm, flyer],
};

function combat(players = 1, classes?: ('engineer' | 'warden')[]) {
  const h = harness(players, 1, { content, classes });
  h.toCombat();
  h.holdSpawns();
  h.put(0, 30, 3.5);
  return h;
}

const routesThrough = (field: { next: Int16Array }, tile: number) =>
  Array.from(field.next).includes(tile);

describe('walls', () => {
  it('reroute Grunts through a gap without being touched', () => {
    const h = combat();
    for (let col = 0; col < COLS; col++)
      if (col !== 24 && col !== 25) h.sim.place('wall', col, 15, 0);
    const g = h.sim.spawnEnemy('grunt', 18.5, 20.5);
    g.hp = g.maxHp = 1e9;
    let crossX: number | null = null;
    h.until(() => {
      if (crossX === null && g.y < 15.5) crossX = g.x;
      return g.y < 12;
    }, 60 * 40);
    expect(crossX).toBeGreaterThan(24);
    expect(crossX).toBeLessThan(26);
    for (const s of h.sim.world.structures) expect(s.hp).toBe(wall.hp);
  });

  it('sealed: the Grunt smashes the wall in its way, then walks through the gap', () => {
    const h = combat();
    for (let col = 0; col < COLS; col++) h.sim.place('wall', col, 15, 0);
    const g = h.sim.spawnEnemy('grunt', 18.5, 20.5);
    g.hp = g.maxHp = 1e9;
    h.until(() => h.sim.world.structures.some((s) => s.hp < s.maxHp), 60 * 30);
    const hit = h.sim.world.structures.find((s) => s.hp < s.maxHp)!;
    expect(hit.kind).toBe('wall');
    hit.hp = 1;
    h.until(() => h.events('destroyed').length > 0, 60 * 5);
    h.until(() => g.y < 12, 60 * 30);
  });

  it('Brutes prefer smashing through a wall line to a long detour (breaker field)', () => {
    const h = combat();
    for (let col = 0; col < COLS; col++) if (col !== 24) h.sim.place('wall', col, 15, 0);
    const f = h.sim.world.fields;
    h.run(1);
    // The ground field detours to the gap; the breaker field runs straight through the walls.
    expect(routesThrough(f.ground, 15 * COLS + 18)).toBe(false);
    expect(f.breaker.next[16 * COLS + 18]).toBe(15 * COLS + 18);
    const b = h.sim.spawnEnemy('brute', 18.5, 17.5);
    b.hp = b.maxHp = 1e9;
    h.until(() => h.sim.world.structures.some((s) => s.hp < s.maxHp), 60 * 20);
    const hit = h.sim.world.structures.find((s) => s.hp < s.maxHp)!;
    expect(Math.abs(hit.tile[0] - 18)).toBeLessThanOrEqual(1);
    // 2× damage vs walls (vsStructure).
    expect(hit.maxHp - hit.hp).toBe(brute.attack.damage * 2);
  });

  it('a destroyed wall rebuilds the flow field the same step', () => {
    const h = combat();
    const f = h.sim.world.fields.ground;
    const t = 10 * COLS + 10;
    const st = h.sim.place('wall', 10, 10, 0);
    h.run(1);
    expect(routesThrough(f, t)).toBe(false);
    st.hp = 0;
    h.run(1);
    expect(h.events('destroyed')).toEqual([
      expect.objectContaining({ id: st.id, structure: 'wall', tile: [10, 10] }),
    ]);
    expect(h.sim.world.fields.dirty).toBe(false);
    expect(routesThrough(f, t)).toBe(true);
    expect(h.sim.world.grid.occupant[t]).toBe(0);
  });
});

describe('placement on occupied tiles', () => {
  it('snares may go under enemies and players; walls and towers may not', () => {
    const h = harness(2, 1, { content });
    h.toBuild();
    const w = h.sim.world;
    h.sim.spawnEnemy('grunt', 7.5, 7.5);
    h.put(1, 9.5, 9.5);
    for (const tile of [
      [7, 7],
      [9, 9],
    ] as const) {
      expect(placementValid(w, 'snare', tile, 0)).toBe(true);
      expect(placementValid(w, 'wall', tile, 0)).toBe(false);
      expect(placementValid(w, 'arrow_tower', tile, 0)).toBe(false);
    }
    // But never on another structure.
    h.sim.place('snare', 5, 5, 0);
    expect(placementValid(w, 'snare', [5, 5], 0)).toBe(false);
    expect(placementValid(w, 'wall', [5, 5], 0)).toBe(false);
  });

  it('the Warden builds a net under an enemy with the build arc', () => {
    const h = combat(1, ['warden']);
    h.put(0, 8.5, 12.5);
    h.p(0).crates = 2;
    const g = h.sim.spawnEnemy('grunt', 8.4, 12.6);
    g.hp = g.maxHp = 1e9;
    h.pads[0]!.tap('radialCommits', { radialSlot: 0 }); // wall: blocked by the enemy
    h.run(1);
    expect(h.sim.world.structures).toHaveLength(0);
    h.pads[0]!.tap('radialCommits', { radialSlot: 1 }); // snare
    h.run(1);
    expect(h.sim.world.structures.map((s) => [s.kind, s.tile])).toEqual([['snare', [8, 12]]]);
    expect(h.p(0).crates).toBe(2 - snare.cost);
  });
});

describe('shock nets', () => {
  function netWith(kind: 'grunt' | 'swarm' | 'brute' | 'flyer', n: number) {
    const h = combat();
    const net = h.sim.place('snare', 10, 10, 0);
    const es = Array.from({ length: n }, (_, i) => {
      const e = h.sim.spawnEnemy(kind, 10.3 + (i % 3) * 0.2, 10.3 + Math.floor(i / 3) * 0.3);
      e.hp = e.maxHp = 1e9;
      return e;
    });
    return { h, net, es };
  }

  it('cost the same as an open tile and never rebuild the field', () => {
    const h = combat();
    const before = Float32Array.from(h.sim.world.fields.ground.dist);
    h.sim.place('snare', 10, 10, 0);
    expect(h.sim.world.fields.dirty).toBe(false);
    h.run(1);
    expect(Array.from(h.sim.world.fields.ground.dist)).toEqual(Array.from(before));
  });

  it('one discharge slows a whole Swarm group on the tile', () => {
    const { h, net, es } = netWith('swarm', 6);
    h.run(1);
    const ev = h.events('snareDischarge');
    expect(ev).toEqual([{ e: 'snareDischarge', id: net.id, left: snare.discharges - 1 }]);
    expect(net.discharges).toBe(snare.discharges - 1);
    for (const e of es) {
      const slow = e.effects.find((x) => x.def === 'slow');
      expect(slow?.strength).toBeCloseTo(snare.slow.strength, 6);
    }
    // The slow shows in their speed and outlasts the tile (2 s).
    h.run(1);
    expect(es[0]!.stats.moveSpeed).toBeCloseTo(swarm.speed * (1 - snare.slow.strength), 6);
  });

  it('rearms after its delay: one discharge per rearm while enemies stand on it', () => {
    const { h, net, es } = netWith('grunt', 1);
    const rearm = Math.round((snare.rearmMs * 60) / 1000);
    // Held on the net: a slowed grunt would otherwise walk off it during the longer rearm.
    const hits: unknown[] = [];
    for (let i = 0; i < rearm + 1; i++) {
      es[0]!.x = es[0]!.y = 10.5;
      hits.push(...h.collect('snareDischarge', 1));
    }
    expect(hits).toHaveLength(2);
    expect(net.discharges).toBe(snare.discharges - 2);
  });

  it('slows don’t stack: the strongest applies; Brutes take half strength', () => {
    const { h, es } = netWith('brute', 1);
    h.run(2);
    const slow = es[0]!.effects.find((x) => x.def === 'slow')!;
    expect(slow.strength).toBeCloseTo(snare.slow.strength * 0.5, 6);
    // Later discharges refresh the one slow (strongest wins, systems/effects), never stack it.
    h.run(40);
    expect(es[0]!.effects.filter((x) => x.def === 'slow')).toHaveLength(1);
    expect(effects.slow?.stacking).toBe('strongest');
    expect(es[0]!.stats.moveSpeed).toBeCloseTo(brute.speed * (1 - snare.slow.strength * 0.5), 6);
  });

  it('Flyers pass over; players never set it off', () => {
    const { h, net } = netWith('flyer', 2);
    h.put(0, 10.5, 10.5);
    h.run(60);
    expect(net.discharges).toBe(snare.discharges);
    expect(h.p(0).effects).toEqual([]);
  });

  it('lasts across waves, then fizzles on its last discharge and frees the tile', () => {
    const h = combat();
    const net = h.sim.place('snare', 10, 10, 0);
    const g = h.sim.spawnEnemy('grunt', 10.5, 10.5);
    h.run(1);
    expect(net.discharges).toBe(snare.discharges - 1);
    // Clear the wave: the net stays through the build phase into the next wave.
    g.hp = 0;
    h.sim.world.spawns.length = 0;
    h.until(() => h.sim.world.phase === 'build', 10);
    expect(h.sim.world.structures).toContain(net);
    h.toCombat();
    h.holdSpawns();
    expect(net.discharges).toBe(snare.discharges - 1);
    const g2 = h.sim.spawnEnemy('grunt', 10.5, 10.5);
    g2.hp = g2.maxHp = 1e9;
    const left: number[] = [];
    for (let i = 0; i < Math.ceil((snare.rearmMs * 60) / 1000) * snare.discharges; i++) {
      g2.x = g2.y = 10.5; // held on the net
      h.run(1);
      left.push(...h.events('snareDischarge').map((e) => e.left));
    }
    expect(left).toEqual(
      Array.from({ length: snare.discharges - 1 }, (_, i) => snare.discharges - 2 - i),
    );
    expect(h.sim.world.structures).toHaveLength(0);
    expect(h.sim.world.grid.occupant[10 * COLS + 10]).toBe(0);
    expect(placementValid(h.sim.world, 'snare', [10, 10], 0)).toBe(true);
  });
});

describe('Fortify', () => {
  it('attaches only to a tower beside the Warden, once, for a defense bonus', () => {
    const h = combat(1, ['warden']);
    h.p(0).crates = 4;
    const w = h.sim.place('wall', 10, 10, 0);
    h.put(0, 11.4, 10.5);
    h.pads[0]!.tap('radialCommits', { radialSlot: 2 });
    h.run(1);
    expect(w.fortified).toBe(false);
    expect(h.p(0).crates).toBe(4);
    const t = h.sim.place('arrow_tower', 10, 12, 0);
    h.put(0, 11.4, 12.5);
    h.pads[0]!.tap('radialCommits', { radialSlot: 2 });
    h.run(1);
    expect(t.fortified).toBe(true);
    expect(t.stats.damageReduction).toBeCloseTo(fortify.defense, 6);
    expect(h.p(0).crates).toBe(4 - fortify.cost);
    expect(h.events('built')).toEqual([
      expect.objectContaining({ id: t.id, structure: 'fortify', tile: [10, 12] }),
    ]);
    // A fortified tower can't be fortified again; walls and open ground never.
    expect(placementValid(h.sim.world, 'fortify', [10, 12], 0)).toBe(false);
    expect(placementValid(h.sim.world, 'fortify', [10, 10], 0)).toBe(false);
    expect(placementValid(h.sim.world, 'fortify', [5, 5], 0)).toBe(false);
  });

  it('a fortified tower takes less damage', () => {
    const h = combat(1, ['warden']);
    // A sealed line: walls, with a fortified tower where the Grunt arrives.
    for (let col = 0; col < COLS; col++) if (col !== 18) h.sim.place('wall', col, 15, 0);
    const t = h.sim.place('arrow_tower', 18, 15, 0);
    h.put(0, 18.5, 14.4);
    h.p(0).crates = 2;
    h.pads[0]!.tap('radialCommits', { radialSlot: 2 });
    h.run(1);
    expect(t.fortified).toBe(true);
    h.put(0, 30, 3.5);
    const g = h.sim.spawnEnemy('grunt', 18.5, 17.5);
    g.hp = g.maxHp = 1e9;
    const hits: number[] = [];
    h.until(() => {
      for (const d of h.events('damage')) if (d.target !== g.id) hits.push(d.amount);
      return hits.length > 0;
    }, 60 * 20);
    expect(h.events('damage').find((d) => d.target !== g.id)?.target).toBe(t.id);
    expect(hits[0]).toBeCloseTo(baseContent.enemies[0]!.attack.damage * (1 - fortify.defense), 6);
  });

  it('works on the mortar too, and the build phase ghost places it', () => {
    const h = harness(1, 1, { content, classes: ['warden'] });
    h.toBuild();
    const m = h.sim.place('bomb_tower', 6, 6, 0);
    h.put(0, 6.5, 7.4);
    h.p(0).crates = 2;
    h.sim.command({ c: 'build', slot: 0, action: 'select', structure: 'fortify' });
    h.sim.command({ c: 'build', slot: 0, action: 'place', ref: 7 });
    h.run(1);
    expect(h.events('command')).toEqual([{ e: 'command', ref: 7, slot: 0, ok: true }]);
    expect(m.fortified).toBe(true);
  });
});

describe('mortar tower', () => {
  it('lobs an arcing shell that damages everything in the blast radius, and nothing outside', () => {
    const h = combat();
    h.sim.place('bomb_tower', 10, 10, 0);
    const near = [
      h.sim.spawnEnemy('grunt', 13.5, 10.5),
      h.sim.spawnEnemy('grunt', 13.5, 11.3),
      h.sim.spawnEnemy('grunt', 14.2, 10.2),
    ];
    const far = h.sim.spawnEnemy('grunt', 13.5, 14.5);
    for (const e of [...near, far]) {
      e.stats.moveSpeed = 0;
      e.hp = e.maxHp = 1e6;
    }
    h.run(1);
    expect(h.events('attack')).toEqual([expect.objectContaining({ slot: 'attack' })]);
    const shell = h.sim.world.projectiles[0]!;
    expect(shell.arc).not.toBeNull();
    expect(shell.from).toBe('bomb_tower');
    let peak = 0;
    h.until(() => {
      peak = Math.max(peak, h.sim.world.projectiles[0]?.z ?? 0);
      return h.sim.world.projectiles.length === 0;
    }, 120);
    expect(peak).toBeGreaterThan(1.5);
    for (const e of near) expect(e.maxHp - e.hp).toBe(bombTower.attack.damage);
    expect(far.hp).toBe(far.maxHp);
  });

  it('ignores Flyers', () => {
    const h = combat();
    h.sim.place('bomb_tower', 10, 10, 0);
    h.sim.spawnEnemy('flyer', 12.5, 10.5);
    h.run(10);
    expect(h.sim.world.projectiles).toHaveLength(0);
  });
});
