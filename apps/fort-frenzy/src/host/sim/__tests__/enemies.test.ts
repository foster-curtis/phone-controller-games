// FF10 enemy scenarios (SPEC §9, §9.1, §15.5): Runner burst, Brute and walls, Siege range and shells,
// Hunter fields and retargeting, Flyers over walls and their substitution, the aggro leash, Swarm
// packs and coins per kill. Walls come from a stand-in def until FF8's wall is on main.
import { describe, expect, it } from 'vitest';
import { content as baseContent, type Content } from '../../../content';
import { engineer } from '../../../content/characters';
import {
  brute as bruteDef,
  flyer as flyerDef,
  runner as runnerDef,
  siege as siegeDef,
} from '../../../content/enemies';
import type { StructureDef } from '../../../content/types';
import type { ClassId } from '../../../shared/ids';
import { RETARGET_TILES } from '../ai/hunter';
import { createCatalog } from '../catalog';
import { createSim, ScriptedInputSource, type Sim } from '../index';
import { createState } from '../state';
import { BASE_ID, type EnemyEnt, type SimEvent } from '../types';
import { startOf } from './harness';

/** FF8 owns the real wall; this stands in with the same shape (blocks, damageable). */
const wallStub: StructureDef = {
  id: 'wall',
  cost: 1,
  hp: 400,
  pathCost: 20,
  blocksProjectiles: true,
};

const content: Content = {
  ...baseContent,
  structures: baseContent.structures.some((s) => s.id === 'wall')
    ? baseContent.structures
    : [...baseContent.structures, wallStub],
  // A non-ranged class for the Flyer check (FF8's Warden may not be on main yet).
  characters: baseContent.characters.some((c) => c.id === 'warden')
    ? baseContent.characters
    : [...baseContent.characters, { ...engineer, id: 'warden' as const }],
};

interface Setup {
  sim: Sim;
  pads: ScriptedInputSource[];
  run(n: number): SimEvent[];
  until(pred: () => boolean, max?: number): void;
}

function setup(classes: ClassId[] = ['engineer'], wave?: number): Setup {
  const start = startOf(classes.length, 3);
  start.slots.forEach((s, i) => (s.classId = classes[i]!));
  const pads = classes.map(() => new ScriptedInputSource());
  const sim = createSim(start, { content, sources: new Map(pads.map((p, i) => [i, p] as const)) });
  const run = (n: number) => {
    const out: SimEvent[] = [];
    for (let i = 0; i < n; i++) {
      sim.step();
      out.push(...sim.world.events);
    }
    return out;
  };
  const until = (pred: () => boolean, max = 60 * 60) => {
    for (let i = 0; i < max; i++) {
      if (pred()) return;
      sim.step();
    }
    if (!pred()) throw new Error(`until: not reached in ${max} steps`);
  };
  if (wave !== undefined) {
    sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave });
    sim.step();
  }
  until(() => sim.world.phase === 'build');
  for (const p of sim.world.players) sim.command({ c: 'ready', slot: p.slot, ready: true });
  until(() => sim.world.phase === 'combat', 5);
  return { sim, pads, run, until };
}

/** Combat with the wave's own spawns held off and the players parked in a far corner. */
function quiet(classes: ClassId[] = ['engineer']): Setup {
  const s = setup(classes);
  for (const sp of s.sim.world.spawns) sp.atTick += 1e7;
  s.sim.world.base.archers.count = 0; // the sentries would shoot what we're watching
  s.sim.world.players.forEach((p, i) => {
    p.x = 33.5 - i;
    p.y = 4.5;
  });
  return s;
}

const hits = (evs: SimEvent[], target: number) =>
  evs.filter(
    (e): e is Extract<SimEvent, { e: 'damage' }> => e.e === 'damage' && e.target === target,
  );

describe('Runner', () => {
  it('bursts the base once and dies, never attacks players, pays no coins', () => {
    const t = quiet();
    const w = t.sim.world;
    const p = w.players[0]!;
    p.x = 18.1;
    p.y = 7; // beside its way, inside its reach
    const coins = w.team.coins;
    const r = t.sim.spawnEnemy('runner', 17.5, 14);
    const hp = w.base.hp;
    const evs: SimEvent[] = [];
    for (let i = 0; i < 60 * 15 && w.enemies.includes(r); i++) evs.push(...t.run(1));
    expect(w.enemies).not.toContain(r);
    expect(hp - w.base.hp).toBe(runnerDef.attack.damage);
    expect(hits(evs, BASE_ID)).toHaveLength(1);
    expect(hits(evs, p.id)).toHaveLength(0);
    expect(p.hp).toBe(p.maxHp);
    expect(evs.filter((e) => e.e === 'attack' && e.source === r.id)).toHaveLength(1);
    expect(evs).toContainEqual(expect.objectContaining({ e: 'death', id: r.id, killer: null }));
    expect(w.team.coins).toBe(coins);
  });

  it('a wall in its way takes the burst instead', () => {
    const t = quiet();
    for (let c = 0; c < 36; c++) t.sim.place('wall', c, 10, 0);
    const wall = t.sim.world.structures.find((s) => s.tile[0] === 17 && s.tile[1] === 10)!;
    const hp = t.sim.world.base.hp;
    const r = t.sim.spawnEnemy('runner', 17.5, 14);
    t.until(() => !t.sim.world.enemies.includes(r), 60 * 10);
    expect(t.sim.world.base.hp).toBe(hp);
    const hurt = t.sim.world.structures.filter((s) => s.kind === 'wall' && s.hp < s.maxHp);
    expect(hurt).toHaveLength(1);
    expect(hurt[0]!.maxHp - hurt[0]!.hp).toBe(runnerDef.attack.damage);
    expect(Math.abs(hurt[0]!.tile[0] - wall.tile[0])).toBeLessThanOrEqual(2);
  });
});

describe('Brute', () => {
  it('smashes through a wall a Grunt walks around (2× damage to walls)', () => {
    const walk = (kind: 'brute' | 'grunt') => {
      const t = quiet();
      for (let c = 13; c <= 22; c++) t.sim.place('wall', c, 10, 0);
      const walls = new Set(
        t.sim.world.structures.filter((s) => s.kind === 'wall').map((s) => s.id),
      );
      const e = t.sim.spawnEnemy(kind, 17.5, 15);
      const evs: SimEvent[] = [];
      for (let i = 0; i < 60 * 40 && e.y > 3; i++) evs.push(...t.run(1));
      const wallHits = evs.filter(
        (x): x is Extract<SimEvent, { e: 'damage' }> =>
          x.e === 'damage' && walls.has(x.target) && x.source === e.id,
      );
      return { e, wallHits };
    };
    const b = walk('brute');
    expect(b.wallHits.length).toBeGreaterThan(0);
    expect(b.wallHits[0]!.amount).toBe(bruteDef.attack.damage * 2);
    const g = walk('grunt');
    expect(g.wallHits).toHaveLength(0);
    expect(g.e.y).toBeLessThanOrEqual(3); // got round
  });

  it('a wall in the way of a chase gets smashed, and the Brute returns to its path', () => {
    const t = quiet();
    const p = t.sim.world.players[0]!;
    const b = t.sim.spawnEnemy('brute', 10.5, 14.5);
    p.x = 12.6;
    p.y = 14.5;
    t.until(() => b.ai === 'aggro', 60);
    t.sim.place('wall', 11, 14, 0);
    const wall = t.sim.world.structures.find((s) => s.kind === 'wall')!;
    t.until(() => wall.hp < wall.maxHp, 60 * 5);
    p.x = 33;
    p.y = 4;
    t.until(() => b.ai === 'path', 60 * 15);
  });
});

describe('Siege', () => {
  it('stops at range from the Citadel and shells it, with a landing marker', () => {
    const t = quiet();
    const w = t.sim.world;
    const s = t.sim.spawnEnemy('siege', 17.5, 22);
    const hp = w.base.hp;
    t.until(() => w.markers.some((m) => m.source === s.id), 60 * 30);
    const m = w.markers.find((x) => x.source === s.id)!;
    const gap = s.y - 2 - s.r; // the Citadel's bottom edge is row 2
    expect(gap).toBeLessThanOrEqual(siegeDef.attack.range);
    expect(gap).toBeGreaterThan(siegeDef.attack.range - 0.5);
    expect(w.projectiles.some((pr) => pr.source === s.id && pr.arc !== null)).toBe(true);
    const y = s.y;
    t.until(() => w.base.hp < hp, m.landsAt - w.tick + 2);
    expect(hp - w.base.hp).toBe(siegeDef.attack.damage);
    t.run(60 * 5);
    expect(s.y).toBeCloseTo(y, 5); // planted
    expect(w.players[0]!.hp).toBe(w.players[0]!.maxHp);
  });

  it('shells a tower in range before the base, from beyond the tower’s reach', () => {
    const t = quiet();
    const w = t.sim.world;
    const tower = t.sim.place('arrow_tower', 17, 12, 0);
    const s = t.sim.spawnEnemy('siege', 17.5, 23);
    t.until(() => tower.hp < tower.maxHp, 60 * 30);
    expect(Math.hypot(s.x - tower.x, s.y - tower.y)).toBeGreaterThan(6);
    expect(s.hp).toBe(s.maxHp);
    expect(w.base.hp).toBe(w.base.maxHp);
  });
});

describe('Hunter', () => {
  it('hunts the nearest player along their field, and retargets on a clearly closer player, daze and death', () => {
    const t = quiet(['engineer', 'engineer']);
    const w = t.sim.world;
    const [a, b] = w.players as [(typeof w.players)[0], (typeof w.players)[0]];
    a.x = 8.5;
    a.y = 14.5;
    b.x = 28.5;
    b.y = 8.5;
    const h = t.sim.spawnEnemy('hunter', 12.5, 20.5);
    t.run(2);
    expect(h.hunting).toBe(a.slot);
    expect(h.ai).toBe('hunt');
    const first = h.huntSince!;
    expect(first).toBeLessThanOrEqual(w.tick);
    const field = w.fields.hunted[a.slot]!;
    expect(field.dist[14 * 36 + 8]).toBe(0);
    // Its quarry steps to a new tile: the field follows.
    a.x = 6.5;
    t.run(1);
    expect(w.fields.hunted[a.slot]!.dist[14 * 36 + 6]).toBe(0);
    // Another player a little closer (inside the hysteresis): it keeps its quarry.
    const dA = Math.hypot(a.x - h.x, a.y - h.y);
    const toward = (d: number) => {
      const dx = (a.x - h.x) / dA;
      const dy = (a.y - h.y) / dA;
      b.x = h.x - dy * d; // off to the side, at distance d
      b.y = h.y + dx * d;
    };
    toward(dA - (RETARGET_TILES - 0.5));
    t.run(2);
    expect(h.hunting).toBe(a.slot);
    expect(h.huntSince).toBe(first);
    // Clearly closer: it switches, and the switch is stamped (the TV's foot flash).
    toward(Math.max(1.6, dA - RETARGET_TILES - 1.5));
    t.run(2);
    expect(h.hunting).toBe(b.slot);
    expect(h.huntSince!).toBeGreaterThan(first);
    // Back out of the way: the first player is clearly closer again.
    b.x = 28.5;
    b.y = 8.5;
    t.run(2);
    expect(h.hunting).toBe(a.slot);
    t.until(() => a.hp < a.maxHp, 60 * 10);
    // Dazed (phone away): the next player.
    t.sim.command({ c: 'presence', slot: a.slot, connected: false });
    t.run(2);
    expect(h.hunting).toBe(b.slot);
    t.until(() => b.hp < b.maxHp, 60 * 20);
    // Down: nobody left, so it heads for the Citadel.
    b.hp = 0;
    t.run(2);
    expect(h.hunting).toBeNull();
    expect(h.ai).not.toBe('hunt');
  });

  it('never goes for the base while a player is up', () => {
    const t = quiet();
    const w = t.sim.world;
    const p = w.players[0]!;
    p.x = 30.5;
    p.y = 20.5;
    t.sim.spawnEnemy('hunter', 17.5, 4);
    const evs = t.run(60 * 25);
    expect(hits(evs, BASE_ID)).toHaveLength(0);
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  // C3 (FF10-fix-1): the Hunter's field prices tower range, so it slips round the defenses.
  const turretRange = 6;
  function towerRun(px: number, py: number) {
    const t = quiet();
    const w = t.sim.world;
    const p = w.players[0]!;
    p.x = px;
    p.y = py;
    const tower = t.sim.place('arrow_tower', 18, 19, 0);
    t.run(1);
    const h = t.sim.spawnEnemy('hunter', 5.5, 20.5);
    h.hp = h.maxHp = 1e9;
    let nearest = Infinity;
    let shots = 0;
    for (let i = 0; i < 60 * 40 && p.hp === p.maxHp; i++) {
      const evs = t.run(1);
      shots += evs.filter((e) => e.e === 'attack' && e.source === tower.id).length;
      nearest = Math.min(nearest, Math.hypot(h.x - tower.x, h.y - tower.y) - h.r);
    }
    return { t, p, h, tower, nearest, shots };
  }

  it('takes a route round a tower’s range when there is one', () => {
    const r = towerRun(30.5, 20.5);
    expect(r.p.hp).toBeLessThan(r.p.maxHp);
    expect(r.nearest).toBeGreaterThan(turretRange);
    expect(r.shots).toBe(0);
  });

  it('still reaches a target standing in tower range', () => {
    const r = towerRun(20.5, 19.5);
    expect(r.p.hp).toBeLessThan(r.p.maxHp);
    expect(r.shots).toBeGreaterThan(0);
  });

  it('re-prices its field when a tower is built or destroyed', () => {
    const t = quiet();
    const w = t.sim.world;
    const p = w.players[0]!;
    p.x = 30.5;
    p.y = 20.5;
    const probe = 20 * 36 + 14; // a tile 4 left of where the tower goes
    t.sim.spawnEnemy('hunter', 5.5, 20.5);
    t.run(1);
    const d0 = w.fields.hunted[0]!.dist[probe]!;
    const tower = t.sim.place('arrow_tower', 18, 19, 0);
    t.run(1);
    const d1 = w.fields.hunted[0]!.dist[probe]!;
    expect(d1).toBeGreaterThan(d0);
    tower.hp = 0;
    t.run(2);
    expect(w.fields.hunted[0]!.dist[probe]!).toBeCloseTo(d0, 4);
  });
});

describe('Flyer', () => {
  it('flies over a sealed wall line to the Citadel and shoots it', () => {
    const t = quiet();
    const w = t.sim.world;
    for (let c = 0; c < 36; c++) t.sim.place('wall', c, 10, 0);
    const f = t.sim.spawnEnemy('flyer', 17.5, 18);
    const evs: SimEvent[] = [];
    for (let i = 0; i < 60 * 20 && w.base.hp === w.base.maxHp; i++) evs.push(...t.run(1));
    expect(f.y).toBeLessThan(10);
    expect(w.base.maxHp - w.base.hp).toBe(flyerDef.attack.damage);
    expect(w.structures.every((s) => s.hp === s.maxHp)).toBe(true);
  });

  it('melee can’t hit it', () => {
    const s = createState(startOf(1, 1), createCatalog(content, 'normal'));
    const f = s.spawnEnemy('flyer', 10, 10, null);
    const g = s.spawnEnemy('grunt', 12, 10, null);
    const melee = (id: number) =>
      s.damage({ source: null, target: id, amount: 30, kind: 'melee', tags: [] }).dealt;
    expect(melee(f.id)).toBe(0);
    expect(f.hp).toBe(f.maxHp);
    expect(melee(g.id)).toBe(30);
    expect(
      s.damage({ source: null, target: f.id, amount: 30, kind: 'ranged', tags: [] }).dealt,
    ).toBe(30);
  });

  it('is replaced by ground units when no Engineer or Quartermaster is connected at wave start', () => {
    const flyers = (classes: ClassId[], dropFirst = false) => {
      const start = startOf(classes.length, 5);
      start.slots.forEach((s, i) => (s.classId = classes[i]!));
      const sim = createSim(start, { content });
      sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: 6 });
      sim.step();
      while (sim.world.phase !== 'build') sim.step();
      if (dropFirst) sim.command({ c: 'presence', slot: 0, connected: false });
      for (const p of sim.world.players) sim.command({ c: 'ready', slot: p.slot, ready: true });
      while ((sim.world.phase as string) !== 'combat') sim.step();
      return {
        n: sim.world.spawns.filter((g) => g.enemy === 'flyer').length,
        flag: sim.world.team.scaling.flyers,
      };
    };
    expect(flyers(['engineer', 'warden'])).toEqual({ n: expect.any(Number), flag: true });
    expect(flyers(['engineer', 'warden']).n).toBeGreaterThanOrEqual(2);
    expect(flyers(['warden', 'warden'])).toEqual({ n: 0, flag: false });
    // The Engineer's phone is away at the wave's start: counted as absent.
    expect(flyers(['engineer', 'warden'], true)).toEqual({ n: 0, flag: false });
  });
});

describe('aggro leash', () => {
  for (const kind of ['grunt', 'brute', 'swarm', 'flyer'] as const) {
    it(`${kind}: leaves its way for a nearby player, then returns past the leash`, () => {
      const t = quiet();
      const p = t.sim.world.players[0]!;
      const e = t.sim.spawnEnemy(kind, 10.5, 14.5);
      p.x = 12;
      p.y = 14.5;
      t.until(() => e.ai === 'aggro', 60);
      expect(e.target).toBe(p.id);
      const from = { ...e.leashFrom! };
      p.x = 33;
      p.y = 22;
      t.until(() => e.ai === 'return', 60 * 10);
      t.until(() => e.ai !== 'return', 60 * 10);
      expect(e.target === null || e.target === BASE_ID).toBe(true);
      expect(Math.hypot(e.x - from.x, e.y - from.y)).toBeLessThan(1);
    });
  }

  it('Runners and Siege never aggro', () => {
    const t = quiet();
    const p = t.sim.world.players[0]!;
    const r = t.sim.spawnEnemy('runner', 10.5, 14.5);
    const s = t.sim.spawnEnemy('siege', 11.5, 16.5);
    p.x = 11;
    p.y = 15;
    t.run(30);
    expect(r.ai).not.toBe('aggro');
    expect(s.ai).not.toBe('aggro');
  });
});

describe('Swarm and coins', () => {
  it('spawns a scattered pack of 8 that pays its 3 coins once, on the last mite', () => {
    const t = quiet();
    const w = t.sim.world;
    t.sim.command({ c: 'debug', slot: -1, action: 'spawn', enemy: 'swarm', lane: 'bottom' });
    t.run(1);
    const pack = w.enemies.filter((e) => e.kind === 'swarm');
    expect(pack).toHaveLength(8);
    expect(new Set(pack.map((e) => e.group)).size).toBe(1);
    // Scattered, not in a row.
    expect(new Set(pack.map((e) => e.y.toFixed(2))).size).toBeGreaterThan(4);
    t.run(60);
    expect(pack.every((e) => e.wander !== undefined)).toBe(true);
    const coins = w.team.coins;
    for (const e of pack.slice(0, 7)) e.hp = 0;
    t.run(1);
    expect(w.team.coins).toBe(coins);
    pack[7]!.hp = 0;
    t.run(1);
    expect(w.team.coins).toBe(coins + 3);
  });

  it('a whole pack dying in one step still pays once', () => {
    const t = quiet();
    t.sim.command({ c: 'debug', slot: -1, action: 'spawn', enemy: 'swarm', lane: 'left' });
    t.run(1);
    const coins = t.sim.world.team.coins;
    for (const e of t.sim.world.enemies) e.hp = 0;
    t.run(1);
    expect(t.sim.world.team.coins).toBe(coins + 3);
  });

  it('every other kill pays its budget cost', () => {
    for (const def of content.enemies.filter((e) => (e.groupSize ?? 1) === 1)) {
      const t = quiet();
      const e: EnemyEnt = t.sim.spawnEnemy(def.id, 12.5, 16.5);
      const coins = t.sim.world.team.coins;
      e.hp = 0;
      t.run(1);
      expect(t.sim.world.team.coins - coins).toBe(def.budget);
    }
  });
});
