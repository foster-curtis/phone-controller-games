// The Commander's kit (SPEC §6.1, §7.4, §8.2–§8.4; RD9): shield bash, Reinforcements, the rally flag,
// the squad and his cards.
import { rngStream } from '@pcg/game-kit';
import { describe, expect, it } from 'vitest';
import { content, type Content } from '../../../content';
import { commander, rallyFlag } from '../../../content/balance';
import type { CardId, ClassId } from '../../../shared/ids';
import { buildFor, meView, type FfMember, type ViewCtx } from '../../net/views';
import { rallyCryChance, rollRallyCry } from '../cards/commander';
import { aimPreview, createSim, soldierPreview, stateHash, superHeld } from '../index';
import { resumeStart, takeSnapshot, type SnapshotMeta } from '../snapshot';
import { harness, type Harness } from './harness';

const meta: SnapshotMeta = {
  savedAt: 1_000_000,
  build: 'test',
  runMs: 1000,
  leaderKey: null,
  ids: (slot) => ({ playerKey: `key-${slot}`, deviceId: `dev-${slot}` }),
};

/** A Commander (or a mixed team) in an empty, open combat, holding `cards`. */
function fight(
  cards: CardId[] = [],
  opts: { classes?: ClassId[]; seed?: number; content?: Content } = {},
): Harness {
  const classes = opts.classes ?? ['commander'];
  const h = harness(classes.length, opts.seed ?? 1, { classes, content: opts.content });
  h.toBuild();
  for (const c of cards) h.give(0, c);
  h.toCombat();
  h.holdSpawns();
  h.put(0, 12, 14);
  return h;
}

const squad = (h: Harness, slot = 0) => h.sim.world.soldiers.filter((u) => u.owner === slot);
const flagBuilds = (h: Harness) => h.sim.world.builds.filter((b) => b.kind === 'rally_flag');

/** Fires Reinforcements with `aim` from a full charge. */
function reinforce(h: Harness, aim = { x: 1, y: 0 }) {
  h.p(0).superCharge = 1;
  h.p(0).super.readyAt = 0;
  h.pads[0]!.tap('superFires', { superAim: aim });
}

/** No passive meter fill, so only what a test does moves the meter. */
const noFill: Content = {
  ...content,
  knights: content.knights.map((k) =>
    k.id === 'commander' ? { ...k, meter: { ...k.meter, perSec: 0 } } : k,
  ),
};

describe('shield bash (§8.2)', () => {
  it('hits in the arc and knocks enemies back; nothing behind him', () => {
    const h = fight();
    const front = h.sim.spawnEnemy('grunt', 13.2, 14);
    const back = h.sim.spawnEnemy('grunt', 10.8, 14);
    const [f0, b0, x0] = [front.hp, back.hp, front.x];
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    h.run(1);
    expect(front.hp).toBeLessThan(f0);
    expect(back.hp).toBe(b0);
    expect(front.push?.x).toBeGreaterThan(0);
    h.run(10);
    expect(front.x).toBeGreaterThan(x0 + 0.5);
  });

  it('Heavy Bash: a wider arc and a stronger knockback', () => {
    const push = (cards: CardId[]) => {
      const h = fight(cards);
      const e = h.sim.spawnEnemy('grunt', 13.2, 14);
      h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
      h.run(1);
      return e.push!.x;
    };
    expect(push(['heavy_bash']) / push([])).toBeCloseTo(1.4, 6);
    // The arc the sim hits with and the TV previews (classes/hitShape.ts).
    const half = (cards: CardId[]) => {
      const shape = aimPreview(fight(cards).p(0), commander, 'main', content.rules);
      return shape.kind === 'cone' ? shape.half : 0;
    };
    expect(half(['heavy_bash']) / half([])).toBeCloseTo(1.2, 6);
  });
});

describe('Reinforcements (§8.2, §8.4)', () => {
  it('throws one soldier along the aim; he lands and joins the squad', () => {
    const h = fight();
    reinforce(h, { x: 1, y: 0 });
    const ev = h.collect('reinforce', 1);
    expect(ev).toEqual([{ e: 'reinforce', slot: 0, count: 1 }]);
    expect(h.p(0).superCharge).toBe(0);
    const u = squad(h).find((x) => x.flight)!;
    expect(u.flight!.to.x).toBeCloseTo(12 + commander.super.spawn.throwRange, 6);
    h.until(() => u.flight === null, 120);
    expect(u.x).toBeCloseTo(12 + commander.super.spawn.throwRange, 1);
    expect(squad(h)).toHaveLength(3);
  });

  it('nothing hits a soldier in the air', () => {
    const h = fight();
    reinforce(h);
    h.run(1);
    const u = squad(h).find((x) => x.flight)!;
    h.sim.world.markers.push({
      id: 9999,
      source: 9999,
      shape: 'circle',
      x: u.x,
      y: u.y,
      r: 3,
      landsAt: h.sim.world.tick,
      payload: { damage: 500, kind: 'area', tags: [], hitsBuilds: false },
    } as never);
    h.run(1);
    expect(u.hp).toBe(u.maxHp);
  });

  it('a quick tap throws toward the flag, stopping at it, or straight ahead with none', () => {
    const ahead = fight();
    ahead.p(0).facing = Math.PI / 2;
    reinforce(ahead, { x: 0, y: 0 });
    ahead.run(1);
    const a = squad(ahead).find((x) => x.flight)!;
    expect(a.flight!.to.x).toBeCloseTo(12, 6);
    expect(a.flight!.to.y).toBeCloseTo(14 + commander.super.spawn.throwRange, 6);

    const h = fight();
    h.p(0).flag = { x: 14, y: 14 };
    reinforce(h, { x: 0, y: 0 });
    h.run(1);
    const u = squad(h).find((x) => x.flight)!;
    expect(u.flight!.to.x).toBeCloseTo(14, 6);
    expect(u.flight!.to.y).toBeCloseTo(14, 6);
    expect(u.mode).toBe('rally');
  });

  it('at the squad cap the super is held: no soldier, the charge kept, the button dimmed', () => {
    const h = fight();
    while (squad(h).length < commander.squad.cap) h.sim.addSoldier(0, 11, 14);
    reinforce(h);
    expect(h.collect('reinforce', 3)).toHaveLength(0);
    expect(h.p(0).superCharge).toBe(1);
    expect(squad(h)).toHaveLength(commander.squad.cap);
    expect(superHeld(h.sim.world, h.p(0), content)).toBe(true);

    // A soldier falls: the held charge can fire.
    squad(h)[0]!.hp = 0;
    h.run(1);
    expect(superHeld(h.sim.world, h.p(0), content)).toBe(false);
    reinforce(h);
    expect(h.collect('reinforce', 1)).toHaveLength(1);
  });

  it('the phone shows the held super as blocked, never ready', () => {
    const h = fight();
    while (squad(h).length < commander.squad.cap) h.sim.addSoldier(0, 11, 14);
    h.p(0).superCharge = 1;
    const m = {
      playerId: 'a',
      name: 'A',
      color: 'cobalt',
      classId: 'commander',
      ready: false,
      connected: true,
      slot: 0,
    } as unknown as FfMember;
    const ctx = {
      party: { isLeader: () => false, screen: () => 'run' },
      content,
      settings: h.sim.world.settings,
      world: h.sim.world,
      summary: null,
    } as unknown as ViewCtx;
    const me = meView(ctx, m);
    expect(me.superBlocked).toBe(true);
    expect(me.superReady).toBe(false);
    expect(me.superCharge).toBe(1);
  });

  it('Reinforced Ranks: +1 squad cap', () => {
    const h = fight(['reinforced_ranks']);
    while (squad(h).length < commander.squad.cap) h.sim.addSoldier(0, 11, 14);
    reinforce(h);
    expect(h.collect('reinforce', 1)).toHaveLength(1);
    expect(squad(h)).toHaveLength(commander.squad.cap + 1);
    expect(superHeld(h.sim.world, h.p(0), content)).toBe(true);
  });

  it('the aim preview shows his landing spot at the soldier’s body radius', () => {
    const h = fight();
    const pv = soldierPreview(h.p(0), content, { x: 0.5, y: 0 })!;
    expect(pv.landing.x).toBeCloseTo(12 + 0.5 * commander.super.spawn.throwRange, 6);
    expect(pv.range).toBe(commander.super.spawn.throwRange);
    expect(pv.radius).toBe(commander.squad.soldier.radius);
  });
});

describe('Rally Cry (§6.1)', () => {
  const rolls = (seed: number, chance: number, n = 1000) => {
    const rng = rngStream(seed, 'combat:1');
    return Array.from({ length: n }, () => rollRallyCry(rng, chance));
  };

  it('rolls from the seeded stream: the same seed makes the same doubles', () => {
    expect(rolls(5, 0.5)).toEqual(rolls(5, 0.5));
    expect(rolls(5, 0.5)).not.toEqual(rolls(6, 0.5));
  });

  it('1 copy is about 50% over 1,000 seeded rolls; 2 copies 75%; 3 copies always', () => {
    expect(rallyCryChance(1, 0.5, 0.25)).toBe(0.5);
    expect(rallyCryChance(2, 0.5, 0.25)).toBe(0.75);
    expect(rallyCryChance(3, 0.5, 0.25)).toBe(1);
    expect(rallyCryChance(4, 0.5, 0.25)).toBe(1);
    for (const seed of [1, 2, 3]) {
      const hits = rolls(seed, rallyCryChance(1, 0.5, 0.25)).filter(Boolean).length;
      expect(hits / 1000).toBeGreaterThanOrEqual(0.45);
      expect(hits / 1000).toBeLessThanOrEqual(0.55);
    }
    expect(rolls(1, rallyCryChance(3, 0.5, 0.25)).every(Boolean)).toBe(true);
  });

  it('in a run: the same seed throws the same counts; 3 copies always throw 2', () => {
    const counts = (seed: number, cards: CardId[]) => {
      const out: number[] = [];
      for (let i = 0; i < 6; i++) {
        const h = fight(cards, { seed: seed + i });
        reinforce(h);
        out.push(h.collect('reinforce', 1)[0]!.count);
      }
      return out;
    };
    expect(counts(3, ['rally_cry'])).toEqual(counts(3, ['rally_cry']));
    expect(counts(3, ['rally_cry', 'rally_cry', 'rally_cry'])).toEqual([2, 2, 2, 2, 2, 2]);
  });

  it('a double never passes the cap', () => {
    const h = fight(['rally_cry', 'rally_cry', 'rally_cry']);
    while (squad(h).length < commander.squad.cap - 1) h.sim.addSoldier(0, 11, 14);
    reinforce(h);
    expect(h.collect('reinforce', 1)[0]!.count).toBe(1);
    expect(squad(h)).toHaveLength(commander.squad.cap);
  });
});

describe('the rally flag (§7.4)', () => {
  it('a full meter throws it, empties the meter and sends the squad', () => {
    const h = fight();
    h.p(0).meter = 1;
    h.pads[0]!.tap('buildFires', { buildAim: { x: 0.5, y: 0 } });
    const plants = h.collect('flag', 1);
    expect(plants).toEqual([{ e: 'flag', slot: 0, action: 'plant' }]);
    expect(h.p(0).meter).toBeLessThan(0.01);
    const to = 12 + 0.5 * rallyFlag.throw.range;
    expect(h.p(0).flag!.x).toBeCloseTo(to, 6);
    expect(flagBuilds(h)).toHaveLength(1);
    expect(flagBuilds(h)[0]!.state).toBe('flight');
    for (const u of squad(h)) expect(u.mode).toBe('rally');
    h.until(() => flagBuilds(h)[0]!.state !== 'flight', 120);
    h.run(240);
    for (const u of squad(h))
      expect(Math.hypot(u.x - to, u.y - 14)).toBeLessThan(commander.squad.formation.flagRing + 0.6);
  });

  it('recall vs throw by meter state', () => {
    const h = fight([], { content: noFill });
    // Full, no flag: throws.
    h.p(0).meter = 1;
    h.pads[0]!.tap('buildFires', { buildAim: { x: 0.5, y: 0 } });
    h.run(2);
    expect(h.p(0).flag).not.toBeNull();
    const first = flagBuilds(h)[0]!.id;
    // Full, flag out: a new flag replaces the old one.
    h.p(0).meter = 1;
    h.pads[0]!.tap('buildFires', { buildAim: { x: 0, y: 0.5 } });
    h.run(2);
    expect(flagBuilds(h)).toHaveLength(1);
    expect(flagBuilds(h)[0]!.id).not.toBe(first);
    expect(h.p(0).flag!.y).toBeCloseTo(14 + 0.5 * rallyFlag.throw.range, 6);
    expect(buildFor(content, h.sim.world, h.p(0)).mode).toBe('recall');
    // Not full, flag out: recalls, and recall never uses the meter.
    h.p(0).meter = 0.4;
    h.pads[0]!.tap('buildFires', { buildAim: { x: 0, y: 0 } });
    expect(h.collect('recall', 1)).toEqual([{ e: 'recall', slot: 0 }]);
    expect(h.p(0).flag).toBeNull();
    expect(flagBuilds(h)).toHaveLength(0);
    expect(h.p(0).meter).toBeCloseTo(0.4, 9);
    for (const u of squad(h)) expect(u.mode).toBe('follow');
    // Not full, no flag: nothing.
    h.pads[0]!.tap('buildFires', { buildAim: { x: 0.5, y: 0 } });
    h.run(2);
    expect(h.p(0).flag).toBeNull();
    expect(flagBuilds(h)).toHaveLength(0);
    expect(buildFor(content, h.sim.world, h.p(0)).mode).toBe('none');
  });

  it('survives a wave change where it stands, and enemies can’t target it', () => {
    const h = fight();
    h.p(0).meter = 1;
    h.pads[0]!.tap('buildFires', { buildAim: { x: 0.5, y: 0 } });
    h.until(() => flagBuilds(h)[0]?.state === 'active', 120);
    const b = flagBuilds(h)[0]!;
    expect(b.targetable).toBe(false);
    const at = { x: b.x, y: b.y };
    h.sim.world.spawns.length = 0;
    h.until(() => h.sim.world.phase === 'build', 10);
    expect(h.sim.world.wave).toBe(2);
    expect(flagBuilds(h)).toEqual([b]);
    expect({ x: b.x, y: b.y }).toEqual(at);
    expect(h.p(0).flag).toEqual(at);
    h.toCombat();
    expect(flagBuilds(h)).toEqual([b]);
  });
});

describe('the squad (§8.4)', () => {
  it('starts at 2 and the fallen never come back; survivors keep their HP across waves', () => {
    const h = fight();
    expect(squad(h)).toHaveLength(2);
    const [a, b] = squad(h);
    a!.hp = 0;
    b!.hp = 17;
    h.run(1);
    expect(squad(h)).toEqual([b]);
    h.sim.world.spawns.length = 0;
    h.until(() => h.sim.world.phase === 'build', 10);
    expect(squad(h)).toEqual([b]);
    expect(b!.hp).toBe(17);
  });

  it('a new soldier takes the lowest free index', () => {
    const h = fight();
    squad(h)[0]!.hp = 0;
    h.run(1);
    reinforce(h);
    h.run(1);
    expect(
      squad(h)
        .map((u) => u.index)
        .sort(),
    ).toEqual([0, 1]);
  });

  it('a resumed run has exactly the survivors, its flag and their HP', () => {
    const h = harness(1, 3, { classes: ['commander'] });
    h.toBuild();
    const [a, b] = squad(h);
    a!.hp = 0;
    b!.hp = 21;
    h.run(1);
    const f = h.sim.addBuild('rally_flag', 20, 14, 0);
    h.p(0).flag = { x: f.x, y: f.y };
    const snap = takeSnapshot(h.sim.world, content, meta);
    const r = createSim(
      resumeStart(snap, () => true),
      { content },
    );
    expect(r.world.soldiers.map((u) => [u.index, u.hp, u.mode])).toEqual([[1, 21, 'rally']]);
    expect(r.world.players[0]!.flag).toEqual({ x: 20, y: 14 });
    expect(r.world.builds.map((x) => x.kind)).toEqual(['rally_flag']);
    expect(takeSnapshot(r.world, content, meta)).toEqual(snap);
    // A second restore is the same run.
    const again = createSim(
      resumeStart(snap, () => true),
      { content },
    );
    expect(stateHash(again.world)).toBe(stateHash(r.world));
  });

  it('squad damage charges his super at the reduced rate and never the meter', () => {
    const h = fight([], { content: noFill });
    h.p(0).meter = 0;
    h.p(0).superCharge = 0;
    h.put(0, 30, 20);
    const u = squad(h)[0]!;
    squad(h)[1]!.hp = 0;
    h.p(0).flag = { x: 10, y: 12 };
    u.mode = 'rally';
    u.x = 10;
    u.y = 12;
    const e = h.sim.spawnEnemy('brute', 10.6, 12);
    e.hp = e.maxHp = 1e6;
    e.stats.moveSpeed = 0;
    const hits = h.collect('damage', 200).filter((d) => d.source === u.id && d.target === e.id);
    expect(hits.length).toBeGreaterThan(0);
    const dealt = hits.reduce((n, d) => n + d.amount, 0);
    expect(h.p(0).superCharge).toBeCloseTo(dealt * commander.superCharge.perSquadDamage, 9);
    expect(commander.superCharge.perSquadDamage).toBeLessThan(commander.superCharge.perDamage);
    expect(h.p(0).meter).toBe(0);
    // His damage for the balance rule counts the squad's.
    expect(h.p(0).run.damageDealt).toBeCloseTo(dealt, 6);
  });

  it('his own bash charges both the super and the meter', () => {
    const h = fight([], { content: noFill });
    h.p(0).meter = 0;
    const e = h.sim.spawnEnemy('brute', 13.2, 14);
    e.hp = e.maxHp = 1e6;
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    h.run(1);
    expect(h.p(0).superCharge).toBeGreaterThan(0);
    expect(h.p(0).meter).toBeGreaterThan(0);
  });

  it('Drillmaster: soldiers get more HP (healing in the gain) and damage; stacks add', () => {
    const hit = (cards: CardId[]) => {
      const h = fight(cards);
      h.put(0, 30, 20);
      h.p(0).flag = { x: 10, y: 12 };
      const u = squad(h)[0]!;
      squad(h)[1]!.hp = 0;
      u.mode = 'rally';
      u.x = 10;
      u.y = 12;
      const e = h.sim.spawnEnemy('brute', 10.6, 12);
      e.hp = e.maxHp = 1e6;
      e.stats.moveSpeed = 0;
      const d = h.collect('damage', 200).find((x) => x.source === u.id && x.target === e.id)!;
      return { dmg: d.amount, maxHp: u.maxHp };
    };
    const base = hit([]);
    const two = hit(['drillmaster', 'drillmaster']);
    expect(two.dmg / base.dmg).toBeCloseTo(1.4, 6);
    expect(two.maxHp / base.maxHp).toBeCloseTo(1.4, 6);
  });
});

describe('regen with his own kit (RC1, §5)', () => {
  const held = (h: Harness) => {
    const p = h.p(0);
    p.hp = p.maxHp / 2;
    p.regen.quietUntil = p.regen.nextRegen = 0;
    return p;
  };

  it('the shield bash restarts the wait', () => {
    const h = fight();
    const p = held(h);
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    h.run(1);
    expect(p.regen.quietUntil).toBeGreaterThan(h.sim.world.tick);
    expect(p.hp).toBe(p.maxHp / 2);
  });

  it('Reinforcements restarts the wait', () => {
    const h = fight();
    const p = held(h);
    reinforce(h);
    h.run(1);
    expect(p.regen.quietUntil).toBeGreaterThan(h.sim.world.tick);
    expect(p.hp).toBe(p.maxHp / 2);
  });

  it('throwing or recalling the flag does not', () => {
    const h = fight([], { content: noFill });
    const p = held(h);
    p.regen.quietUntil = p.regen.nextRegen = 1e6;
    const q = p.regen.quietUntil;
    p.meter = 1;
    h.pads[0]!.tap('buildFires', { buildAim: { x: 0.5, y: 0 } });
    h.run(2);
    expect(p.flag).not.toBeNull();
    expect(p.regen.quietUntil).toBe(q);
    h.pads[0]!.tap('buildFires', { buildAim: { x: 0, y: 0 } });
    h.run(2);
    expect(p.flag).toBeNull();
    expect(p.regen.quietUntil).toBe(q);
  });
});

describe('Morale, Forced March, Warcry (§6.1)', () => {
  const morale = (u: { effects: readonly { def: string; strength: number }[] }) =>
    u.effects.filter((e) => e.def === 'morale');
  const params = content.cards.find((c) => c.id === 'morale')!.module!.params!;

  it('reaches knights and soldiers near him or his flag, as one effect', () => {
    const h = fight(['morale'], { classes: ['commander', 'ranger', 'ranger', 'ranger'] });
    h.put(1, 13, 14); // near him
    h.put(2, 25, 14); // near the flag
    h.put(3, 34, 22); // near neither
    const f = h.sim.addBuild('rally_flag', 25, 14, 0);
    h.p(0).flag = { x: f.x, y: f.y };
    for (const u of squad(h)) u.mode = 'rally';
    h.run(3);
    expect(morale(h.p(1))).toHaveLength(1);
    expect(morale(h.p(2))).toHaveLength(1);
    expect(morale(h.p(3))).toHaveLength(0);
    // Inside both areas: still one effect, at one strength.
    h.put(1, 24.5, 14);
    h.put(0, 25.5, 14);
    h.run(3);
    expect(morale(h.p(1))).toHaveLength(1);
    expect(morale(h.p(1))[0]!.strength).toBe(params.strength);
    expect(h.p(1).stats.moveSpeed).toBeCloseTo(
      content.knights.find((k) => k.id === 'ranger')!.moveSpeed * (1 + (params.strength as number)),
      6,
    );
  });

  it('the flag keeps its area while he is down', () => {
    const h = fight(['morale'], { classes: ['commander', 'ranger'] });
    h.put(1, 25, 14);
    const f = h.sim.addBuild('rally_flag', 25, 14, 0);
    h.p(0).flag = { x: f.x, y: f.y };
    h.p(0).hp = 0;
    h.run(2);
    expect(h.p(0).respawnAt).not.toBeNull();
    h.run(30);
    expect(morale(h.p(1))).toHaveLength(1);
  });

  it('nobody has it without the card', () => {
    const h = fight([], { classes: ['commander', 'ranger'] });
    h.put(1, 12.5, 14);
    h.run(5);
    expect(morale(h.p(0))).toHaveLength(0);
    expect(morale(h.p(1))).toHaveLength(0);
  });

  it('Forced March: the squad walks faster, capped like movement speed', () => {
    const speed = (cards: CardId[]) => {
      const h = fight(cards);
      const u = squad(h)[0]!;
      h.p(0).flag = { x: 30, y: 14 };
      u.mode = 'rally';
      u.x = 28;
      u.y = 14;
      h.run(1);
      return Math.hypot(u.vx, u.vy);
    };
    const base = speed([]);
    expect(speed(['forced_march']) / base).toBeCloseTo(1.2, 6);
    const many = Array<CardId>(5).fill('forced_march');
    expect(speed(many) / base).toBeCloseTo(1.4, 6);
  });

  it('Warcry: Reinforcements gives nearby knights morale and tells the TV who', () => {
    const h = fight(['rally_cry', 'vanguard', 'warcry'], {
      classes: ['commander', 'ranger', 'ranger'],
    });
    h.put(1, 13, 14);
    h.put(2, 30, 14);
    reinforce(h);
    const cries = h.collect('warcry', 1);
    expect(cries).toHaveLength(1);
    expect(cries[0]!.targets).toEqual([h.p(1).id]);
    expect(morale(h.p(1))).toHaveLength(1);
    expect(morale(h.p(2))).toHaveLength(0);
  });
});

describe('content (§7.4, §8.2)', () => {
  it('his super is an aimed throw, and the flag’s preview radius is the squad’s ring', () => {
    expect(commander.input.super).toBe('aimed');
    expect(commander.super.shape).toBe('spawn');
    expect(rallyFlag.radius).toBe(commander.squad.formation.flagRing);
    expect((commander as { passive?: unknown }).passive).toBeUndefined();
  });
});
