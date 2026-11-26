// The Warden's cards from RD11 (SPEC §6.1): Wide Field and Reinforced Generator on his shield
// generator, Challenger (his passive card: enemies in aggro range pick him first), Fault Line (the
// jump slam's slowing fissure, needs Aftershock + Earthshaker), and Earthshaker adding no boss stagger.
import { describe, expect, it } from 'vitest';
import { cards as cardDefs, rules, shieldGen, warden } from '../../../content/balance';
import type { RulesDef, StatId } from '../../../content/types';
import type { CardId, ClassId } from '../../../shared/ids';
import { collectStatMods, statValue } from '../../systems/modifiers';
import { fissuresOf } from '../cards/warden';
import type { EnemyEnt, PlayerEnt } from '../types';
import { harness, type Harness } from './harness';

const steps = (ms: number) => Math.max(1, Math.round((ms * 60) / 1000));
type Pick = [slot: number, card: CardId];

/** Combat, nothing spawning, no sentries, players invincible, with the picks made in the build phase. */
function arena(classes: ClassId[], picks: Pick[] = []): Harness {
  const h = harness(classes.length, 3, { classes });
  h.toBuild();
  for (const [slot, card] of picks) h.give(slot, card);
  h.toCombat();
  h.holdSpawns();
  h.sim.world.base.archers.count = 0;
  h.sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
  h.sim.world.players.forEach((p, i) => h.put(p.slot, i % 2 === 0 ? 1 : 35, 1 + i * 0.5));
  h.run(1);
  return h;
}

const buildStat = (p: PlayerEnt, base: number, stat: StatId) =>
  statValue(
    base,
    collectStatMods(p.mods),
    stat,
    (rules.statCaps as RulesDef['statCaps'])[stat],
    'build',
  );

const params = (id: CardId) => cardDefs.find((c) => c.id === id)!.module!.params!;

function jumpSlam(h: Harness, slot = 0, aim = { x: 1, y: 0 }) {
  h.p(slot).superCharge = 1;
  h.pads[slot]!.tap('superFires', { superAim: aim });
  h.run(1 + steps(warden.super.windupMs));
}

describe('build cards', () => {
  it('wide_field: a larger shield generator field', () => {
    const h = arena(['warden'], [[0, 'wide_field']]);
    expect(buildStat(h.p(0), shieldGen.radius, 'buildRadius')).toBeCloseTo(
      shieldGen.radius * 1.25,
      6,
    );
  });

  it('reinforced_generator: more generator HP and a stronger guard, stacking', () => {
    const h = arena(
      ['warden'],
      [
        [0, 'reinforced_generator'],
        [0, 'reinforced_generator'],
      ],
    );
    const p = h.p(0);
    expect(p.cards.reinforced_generator).toBe(2);
    expect(buildStat(p, shieldGen.hp, 'buildHp')).toBeCloseTo(shieldGen.hp * 1.8, 6);
    expect(buildStat(p, shieldGen.guard, 'buildPower')).toBeCloseTo(shieldGen.guard * 1.4, 6);
  });
});

describe('challenger (his passive card)', () => {
  /** A Grunt with the Ranger 1 tile away and the Warden 2 tiles away, both inside its aggro radius. */
  function pick(picks: Pick[]): { h: Harness; e: EnemyEnt } {
    const h = arena(['warden', 'ranger'], picks);
    const e = h.sim.spawnEnemy('grunt', 20, 14);
    h.put(1, e.x - 1, e.y);
    h.put(0, e.x + 2, e.y);
    h.run(1);
    return { h, e };
  }

  it('makes an enemy in aggro range pick the Warden over a nearer knight', () => {
    const plain = pick([]);
    expect(plain.e.target).toBe(plain.h.p(1).id);
    const taunt = pick([[0, 'challenger']]);
    expect(taunt.h.p(0).effects.some((x) => x.def === 'taunt')).toBe(true);
    expect(taunt.e.ai).toBe('aggro');
    expect(taunt.e.target).toBe(taunt.h.p(0).id);
  });

  it('pulls an enemy already chasing someone else once he comes in range; not from outside it', () => {
    const h = arena(['warden', 'ranger'], [[0, 'challenger']]);
    const e = h.sim.spawnEnemy('grunt', 20, 14);
    h.put(1, e.x - 1, e.y);
    h.put(0, e.x + 8, e.y);
    h.run(1);
    expect(e.target).toBe(h.p(1).id);
    // Each step he stands 1.8 tiles off it (inside its aggro radius); a swing already wound up at
    // the Ranger lands first, then it turns on him.
    h.until(() => {
      h.put(0, e.x + 1.8, e.y);
      return e.target === h.p(0).id;
    }, 120);
    expect(e.ai).toBe('aggro');
  });

  it('carries no taunt in the build phase, and is unique', () => {
    const h = harness(1, 3, { classes: ['warden'] });
    h.toBuild();
    h.give(0, 'challenger');
    h.run(5);
    expect(h.p(0).effects.some((x) => x.def === 'taunt')).toBe(false);
    const def = cardDefs.find((c) => c.id === 'challenger')!;
    expect(def.unique).toBe(true);
    expect(def.tier).toBe('rare');
  });
});

describe('fault_line (Aftershock + Earthshaker)', () => {
  it('needs both prerequisites', () => {
    expect(cardDefs.find((c) => c.id === 'fault_line')!.requires!.sort()).toEqual([
      'aftershock',
      'earthshaker',
    ]);
  });

  it('the jump slam leaves a fissure along its aim that slows ground enemies on it, then closes', () => {
    const p = params('fault_line');
    const h = arena(
      ['warden'],
      [
        [0, 'aftershock'],
        [0, 'earthshaker'],
        [0, 'fault_line'],
      ],
    );
    h.put(0, 10, 14);
    jumpSlam(h);
    const f = fissuresOf(h.p(0));
    expect(f).toHaveLength(1);
    const len = Math.hypot(f[0]!.x2 - f[0]!.x, f[0]!.y2 - f[0]!.y);
    expect(len).toBeCloseTo(warden.super.range * (p.lengthPct as number), 6);
    expect(f[0]!.y2).toBeCloseTo(14, 6);
    // Spawned after the landing, so only the fissure can slow them.
    const on = h.sim.spawnEnemy('grunt', 12.5, 14);
    const off = h.sim.spawnEnemy('grunt', 12.5, 17);
    h.run(2);
    const slow = on.effects.find((x) => x.def === 'slow');
    expect(slow?.strength).toBeCloseTo(p.slow as number, 6);
    expect(off.effects.some((x) => x.def === 'slow')).toBe(false);
    // Closed after `fissureMs`: a newcomer on the line isn't slowed.
    h.run(steps(p.fissureMs as number));
    expect(fissuresOf(h.p(0))).toHaveLength(0);
    const late = h.sim.spawnEnemy('grunt', 12.5, 14);
    h.run(2);
    expect(late.effects.some((x) => x.def === 'slow')).toBe(false);
  });

  it('without the card the jump slam leaves no fissure', () => {
    const h = arena(
      ['warden'],
      [
        [0, 'aftershock'],
        [0, 'earthshaker'],
      ],
    );
    h.put(0, 10, 14);
    jumpSlam(h);
    expect(fissuresOf(h.p(0))).toHaveLength(0);
  });
});

describe('earthshaker on the boss', () => {
  it('adds no stagger: the Colossus fills the same with or without it', () => {
    const fill = (picks: Pick[]) => {
      const h = arena(['warden'], picks);
      h.put(0, 10, 14);
      const e = h.sim.spawnEnemy('colossus', 12.5, 14);
      e.hp = e.maxHp = 1e6;
      jumpSlam(h);
      return e.boss!.stagger;
    };
    const base = fill([]);
    expect(base).toBeGreaterThan(0);
    expect(fill([[0, 'earthshaker']])).toBeCloseTo(base, 9);
  });
});
