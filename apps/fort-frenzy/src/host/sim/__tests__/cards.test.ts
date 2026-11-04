// Upgrade card scenarios (SPEC §6.1): one test per card, picked through the real `card` command
// (harness `give`), plus stacking (×N) and the stat caps.
import { describe, expect, it } from 'vitest';
import { rules } from '../../../content/base';
import { cards as cardDefs } from '../../../content/cards';
import { engineer, quartermaster, warden } from '../../../content/characters';
import type { RulesDef, StatId } from '../../../content/types';
import { CARD_IDS, type CardId, type ClassId } from '../../../shared/ids';
import { collectStatMods, statValue } from '../../systems/modifiers';
import { harness, type Harness } from './harness';
import type { PlayerEnt } from '../types';

const steps = (ms: number) => Math.max(1, Math.round((ms * 60) / 1000));
const COOLDOWN = steps(engineer.main.cooldownMs) + 2;

type Pick = [slot: number, card: CardId, n?: number];

/** A harness in combat (spawns held, players invincible) with the given picks made in the build phase. */
function game(classes: ClassId[], picks: Pick[] = [], seed = 1): Harness {
  const h = harness(classes.length, seed, { classes });
  h.toBuild();
  for (const [slot, card, n] of picks) h.give(slot, card, n ?? 1);
  h.toCombat();
  h.holdSpawns();
  h.sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
  h.run(1);
  return h;
}

/** One attack value as the sim reads it: `base` through the player's mods (rules caps). */
function atk(
  p: PlayerEnt,
  base: number,
  stat: StatId,
  scope?: 'main' | 'super' | 'passive',
): number {
  const caps: RulesDef['statCaps'] = rules.statCaps;
  return statValue(base, collectStatMods(p.mods), stat, caps[stat], scope);
}

const effectOf = (u: { effects: readonly { def: string }[] }, def: string) =>
  u.effects.find((e) => e.def === def) as { strength: number; remaining: number } | undefined;

/** Fires the Engineer's main (not Steady: a barely moving stick) along +x from (10, 16). */
function shoot(h: Harness, slot = 0) {
  h.put(slot, 10, 16);
  h.p(slot).stillTicks = 0;
  h.pads[slot]!.set({ move: { x: 0.001, y: 0 } });
  h.run(1);
  h.pads[slot]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
  h.run(1);
}

describe('card coverage', () => {
  it('has a def for every card id, once', () => {
    expect(cardDefs.map((c) => c.id).sort()).toEqual([...CARD_IDS].sort());
  });
});

// ---- shared commons -----------------------------------------------------------------------------

type Common = { stat: StatId; pct: boolean; by: Record<ClassId, number> };
const per = (pct: boolean, stat: StatId, e: number, w: number, q: number, c: number): Common => ({
  stat,
  pct,
  by: { engineer: e, warden: w, quartermaster: q, commander: c },
});
const COMMONS: Partial<Record<CardId, Common>> = {
  vitality: per(true, 'maxHp', 0.12, 0.1, 0.12, 0.1),
  might: per(true, 'damage', 0.1, 0.1, 0.12, 0.1),
  haste: per(true, 'attackSpeed', 0.1, 0.1, 0.1, 0.12),
  reach: per(true, 'range', 0.08, 0.1, 0.1, 0.12),
  swiftness: per(true, 'moveSpeed', 0.08, 0.1, 0.08, 0.08),
  focus: per(true, 'superCharge', 0.12, 0.12, 0.15, 0.12),
  toughness: per(false, 'damageReduction', 0.06, 0.08, 0.06, 0.07),
  quick_recovery: per(false, 'respawnMs', -2000, -2000, -2000, -2000),
};
const CLASSES: ClassId[] = ['engineer', 'warden', 'quartermaster', 'commander'];

/** The stat as a card sees it: unit stats directly, attack-only ones through a 100-point base. */
const readStat = (p: PlayerEnt, stat: StatId) =>
  stat === 'damage' || stat === 'range' ? atk(p, 100, stat, 'super') : p.stats[stat];

describe('shared commons (numbers per class)', () => {
  for (const [id, c] of Object.entries(COMMONS) as [CardId, Common][]) {
    for (const cls of CLASSES) {
      it(`${id} on the ${cls}`, () => {
        const h = harness(1, 1, { classes: [cls] });
        h.toBuild();
        const before = readStat(h.p(0), c.stat);
        h.give(0, id);
        const after = readStat(h.p(0), c.stat);
        const v = c.by[cls];
        expect(after).toBeCloseTo(c.pct ? before * (1 + v) : before + v, 6);
      });
    }
  }

  it('vitality: the new max HP comes in full', () => {
    const h = harness(1, 1, { classes: ['engineer'] });
    h.toBuild();
    h.give(0, 'vitality');
    expect(h.p(0).maxHp).toBeCloseTo(engineer.hp * 1.12, 6);
    expect(h.p(0).hp).toBeCloseTo(h.p(0).maxHp, 6);
  });

  it('stacks add: two Might picks give twice the bonus', () => {
    const h = harness(1, 1, { classes: ['engineer'] });
    h.toBuild();
    h.give(0, 'might');
    expect(atk(h.p(0), 100, 'damage', 'main')).toBeCloseTo(110, 6);
    h.give(0, 'might');
    expect(h.p(0).cards.might).toBe(2);
    expect(atk(h.p(0), 100, 'damage', 'main')).toBeCloseTo(120, 6);
  });

  it('reach is capped at +40% range', () => {
    const h = harness(1, 1, { classes: ['engineer'] });
    h.toBuild();
    h.give(0, 'reach', 10);
    expect(atk(h.p(0), engineer.main.range, 'range', 'main')).toBeCloseTo(
      engineer.main.range * 1.4,
      6,
    );
  });

  it('swiftness is capped at +40% move speed', () => {
    const h = harness(1, 1, { classes: ['engineer'] });
    h.toBuild();
    h.give(0, 'swiftness', 10);
    expect(h.p(0).stats.moveSpeed).toBeCloseTo(engineer.moveSpeed * 1.4, 6);
  });

  it('toughness is capped at 0.4 damage reduction', () => {
    const h = harness(1, 1, { classes: ['engineer'] });
    h.toBuild();
    h.give(0, 'toughness', 10);
    expect(h.p(0).stats.damageReduction).toBeCloseTo(0.4, 6);
  });

  it('quick_recovery never drops the respawn below 5 s', () => {
    const h = harness(1, 1, { classes: ['engineer'] });
    h.toBuild();
    h.give(0, 'quick_recovery', 2);
    expect(h.p(0).stats.respawnMs).toBe(rules.respawnMs - 4000);
    h.give(0, 'quick_recovery', 6);
    expect(h.p(0).stats.respawnMs).toBe(5000);
  });
});

// ---- engineer -----------------------------------------------------------------------------------

describe('engineer cards', () => {
  it('quick_draw: main bolts fly 25% faster', () => {
    const speed = (picks: Pick[]) => {
      const h = game(['engineer'], picks);
      shoot(h);
      const b = h.sim.world.projectiles[0]!;
      return Math.hypot(b.vx, b.vy);
    };
    expect(speed([[0, 'quick_draw']]) / speed([])).toBeCloseTo(1.25, 6);
  });

  it('blast_radius: the super circle is 20% wider', () => {
    const hit = (picks: Pick[]) => {
      const h = game(['engineer'], picks);
      h.put(0, 10, 16);
      // Edge at 1.1× the base radius: outside the base circle, inside the 1.2× one.
      const e = h.sim.spawnEnemy('grunt', 0, 16);
      e.x = 10 + engineer.super.radius * 1.1 + e.r;
      h.p(0).superCharge = 1;
      h.pads[0]!.tap('superFires');
      h.run(1);
      return e.hp < e.maxHp;
    };
    expect(hit([])).toBe(false);
    expect(hit([[0, 'blast_radius']])).toBe(true);
  });

  it('fire_arrows: a main hit sets the enemy burning and it takes damage over time', () => {
    const h = game(['engineer'], [[0, 'fire_arrows']]);
    shoot(h);
    const e = h.sim.spawnEnemy('grunt', 14, 16);
    h.run(30);
    expect(effectOf(e, 'burn')).toBeDefined();
    const afterHit = e.hp;
    expect(afterHit).toBe(e.maxHp - engineer.main.damage);
    h.run(90);
    expect(e.hp).toBeLessThan(afterHit);
  });

  it('piercing_shot: one bolt hits two enemies in a line', () => {
    const second = (picks: Pick[]) => {
      const h = game(['engineer'], picks);
      h.put(0, 10, 16);
      const a = h.sim.spawnEnemy('grunt', 13, 16);
      const b = h.sim.spawnEnemy('grunt', 15, 16);
      h.pads[0]!.set({ move: { x: 0.001, y: 0 } });
      h.run(1);
      h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
      h.run(40);
      return [a.hp < a.maxHp, b.hp < b.maxHp];
    };
    expect(second([])).toEqual([true, false]);
    expect(second([[0, 'piercing_shot']])).toEqual([true, true]);
  });

  it('skyhunter: +50% damage to Flyers (and it favors Flyers in the offer)', () => {
    expect(cardDefs.find((c) => c.id === 'skyhunter')!.favoredEnemy).toBe('flyer');
    const dealt = (picks: Pick[]) => {
      const h = game(['engineer'], picks);
      shoot(h);
      const f = h.sim.spawnEnemy('flyer', 14, 16);
      f.hp = f.maxHp = 1e6;
      h.run(30);
      return f.maxHp - f.hp;
    };
    const base = dealt([]);
    expect(base).toBe(engineer.main.damage);
    expect(dealt([[0, 'skyhunter']])).toBeCloseTo(base * 1.5, 6);
  });

  it('deadeye: Steady Aim kicks in after 360 ms instead of 600 ms', () => {
    expect(
      atk(game(['engineer'], [[0, 'deadeye']]).p(0), 600, 'durationMs', 'passive'),
    ).toBeCloseTo(360, 6);
    const dealt = (picks: Pick[]) => {
      const h = game(['engineer'], picks);
      h.put(0, 10, 16);
      h.p(0).stillTicks = 0;
      h.run(steps(450));
      const e = h.sim.spawnEnemy('grunt', 13, 16);
      e.hp = e.maxHp = 1e6;
      h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
      h.run(30);
      return e.maxHp - e.hp;
    };
    expect(dealt([])).toBe(engineer.main.damage);
    expect(dealt([[0, 'deadeye']])).toBeCloseTo(engineer.main.damage * 1.25, 6);
  });

  it('volley: every 4th main shot fires 3 bolts', () => {
    const h = game(['engineer'], [[0, 'volley']]);
    h.put(0, 10, 16);
    h.pads[0]!.set({ move: { x: 0.001, y: 0 } });
    h.run(1);
    const seen = new Set<number>();
    const counts: number[] = [];
    for (let i = 0; i < 4; i++) {
      h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
      h.run(1);
      const fresh = h.sim.world.projectiles.filter((p) => !seen.has(p.id));
      fresh.forEach((p) => seen.add(p.id));
      counts.push(fresh.length);
      h.run(COOLDOWN);
    }
    expect(counts).toEqual([1, 1, 1, 3]);
  });

  it('wildfire: a burning enemy that dies passes burn to a neighbor', () => {
    const neighborBurns = (picks: Pick[]) => {
      const h = game(['engineer'], picks);
      h.put(0, 10, 16);
      const a = h.sim.spawnEnemy('grunt', 14, 16);
      const b = h.sim.spawnEnemy('grunt', 14, 16.9);
      a.hp = 40;
      h.pads[0]!.set({ move: { x: 0.001, y: 0 } });
      h.run(1);
      h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
      h.run(150);
      expect(a.hp).toBeLessThanOrEqual(0);
      return effectOf(b, 'burn') !== undefined;
    };
    expect(neighborBurns([[0, 'fire_arrows']])).toBe(false);
    expect(
      neighborBurns([
        [0, 'fire_arrows'],
        [0, 'wildfire'],
      ]),
    ).toBe(true);
  });
});

// ---- warden -------------------------------------------------------------------------------------

describe('warden cards', () => {
  const slamWindup = steps(warden.main.windupMs) + 1;

  it('heavy_slam: the slam arc is 20% wider', () => {
    const p = game(['warden'], [[0, 'heavy_slam']]).p(0);
    expect(atk(p, warden.main.arcDeg, 'arcDeg', 'main')).toBeCloseTo(warden.main.arcDeg * 1.2, 6);
    // The stomp is untouched.
    expect(atk(p, warden.super.arcDeg, 'arcDeg', 'super')).toBeCloseTo(warden.super.arcDeg, 6);
  });

  it('earthshaker: the stomp stuns 30% longer', () => {
    const stun = (picks: Pick[]) => {
      const h = game(['warden'], picks);
      h.put(0, 10, 12);
      const e = h.sim.spawnEnemy('grunt', 12.5, 12);
      h.p(0).superCharge = 1;
      h.pads[0]!.tap('superFires', { superAim: { x: 1, y: 0 } });
      h.run(1 + steps(warden.super.windupMs));
      return effectOf(e, 'stun')!.remaining;
    };
    const base = stun([]);
    expect(stun([[0, 'earthshaker']]) / base).toBeCloseTo(1.3, 1);
  });

  it('aftershock: a slam leaves enemies in front slowed', () => {
    const slowed = (picks: Pick[]) => {
      const h = game(['warden'], picks);
      h.put(0, 10, 12);
      const e = h.sim.spawnEnemy('grunt', 11.2, 12);
      e.hp = e.maxHp = 1e6;
      h.pads[0]!.tap('mainFires');
      h.run(slamWindup + 10);
      return effectOf(e, 'slow');
    };
    expect(slowed([])).toBeUndefined();
    expect(slowed([[0, 'aftershock']])!.strength).toBeCloseTo(0.35, 6);
  });

  it('giant_slayer: +50% damage to Brutes', () => {
    const dealt = (picks: Pick[]) => {
      const h = game(['warden'], picks);
      h.put(0, 10, 12);
      const e = h.sim.spawnEnemy('brute', 11.2, 12);
      e.hp = e.maxHp = 1e6;
      h.pads[0]!.tap('mainFires');
      h.run(slamWindup + 1);
      return e.maxHp - e.hp;
    };
    const base = dealt([]);
    expect(base).toBeGreaterThan(0);
    expect(dealt([[0, 'giant_slayer']])).toBeCloseTo(base * 1.5, 6);
  });

  it('master_mason: walls repair 50% faster and the aura reaches 30% further', () => {
    const repaired = (picks: Pick[]) => {
      const h = game(['warden'], picks);
      h.put(0, 10.5, 12.5);
      const w = h.sim.place('wall', 11, 13, 0);
      w.hp = 100;
      h.run(60);
      return w.hp - 100;
    };
    expect(repaired([])).toBeCloseTo(10, 0);
    expect(repaired([[0, 'master_mason']])).toBeCloseTo(15, 0);
    const p = game(['warden'], [[0, 'master_mason']]).p(0);
    expect(atk(p, 2.5, 'auraRadius', 'passive')).toBeCloseTo(3.25, 6);
  });

  it('bodyguard: a nearby ally gets the aura and takes less damage, a far one does not', () => {
    const h = game(['warden', 'engineer', 'engineer'], [[0, 'bodyguard']]);
    h.put(0, 10, 12);
    h.put(1, 12, 12);
    h.put(2, 20, 12);
    h.run(20);
    expect(effectOf(h.p(1), 'aura_bodyguard')).toBeDefined();
    expect(h.p(1).stats.damageReduction).toBeCloseTo(0.2, 6);
    expect(effectOf(h.p(2), 'aura_bodyguard')).toBeUndefined();
    expect(h.p(2).stats.damageReduction).toBe(0);
    // Not on himself.
    expect(effectOf(h.p(0), 'aura_bodyguard')).toBeUndefined();
  });

  it('unshakable: refuses slow, accepts other effects, and cannot be pushed', () => {
    const h = game(['warden'], [[0, 'unshakable']]);
    const m = h.p(0).mods.find((x) => x.id === 'card:unshakable')!;
    const ctx = {} as never;
    const ev = (effect: string) => ({ effect, strength: 0.5, durationMs: 1000 }) as never;
    expect(m.hooks!.beforeEffect!(ctx, h.p(0), ev('slow'))).toBe(false);
    expect(m.hooks!.beforeEffect!(ctx, h.p(0), ev('stun'))).toBe(true);
    h.p(0).push = { x: 5, y: 0 };
    h.run(1);
    expect(h.p(0).push ?? null).toBeNull();
  });

  it('fault_line: the stomp shocks and slows an enemy at a far wall', () => {
    const run = (picks: Pick[]) => {
      const h = game(['warden'], picks);
      h.put(0, 10, 12);
      h.sim.place('wall', 20, 13, 0);
      // Enemies walk off, so hold them: one touching the wall's top edge, one far from any wall.
      const onWall = h.sim.spawnEnemy('grunt', 20.5, 12.6);
      const away = h.sim.spawnEnemy('grunt', 25, 18);
      h.p(0).superCharge = 1;
      h.pads[0]!.tap('superFires', { superAim: { x: -1, y: 0 } });
      const events = [];
      for (let i = 0; i < steps(warden.super.windupMs) + 3; i++) {
        onWall.x = 20.5;
        onWall.y = 12.6;
        away.x = 25;
        away.y = 18;
        events.push(...h.collect('faultLine', 1));
      }
      return { onWall, away, events };
    };
    const off = run([]);
    expect(off.events).toHaveLength(0);
    expect(off.onWall.hp).toBe(off.onWall.maxHp);
    const on = run([[0, 'fault_line']]);
    expect(on.events).toEqual([{ e: 'faultLine', slot: 0 }]);
    expect(on.onWall.maxHp - on.onWall.hp).toBe(warden.super.damage);
    expect(effectOf(on.onWall, 'slow')!.strength).toBeCloseTo(0.4, 6);
    expect(on.away.hp).toBe(on.away.maxHp);
  });
});

// ---- quartermaster ------------------------------------------------------------------------------

describe('quartermaster cards', () => {
  const MEDIC = steps(1000) + 1;

  it('light_load: a crate carrier in the aura loses less speed', () => {
    const run = (picks: Pick[]) => {
      const h = game(['quartermaster', 'engineer'], picks);
      h.put(0, 10, 16);
      h.put(1, 10, 16);
      h.p(1).crates = 4;
      h.pads[1]!.set({ move: { x: 1, y: 0 } });
      h.run(30);
      return { fx: effectOf(h.p(1), 'aura_field_medic'), dx: h.p(1).x - 10 };
    };
    const off = run([]);
    const on = run([[0, 'light_load']]);
    expect(off.fx).toBeUndefined();
    expect(on.fx!.strength).toBeCloseTo(0.5, 6);
    expect(on.dx).toBeGreaterThan(off.dx + 0.1);
  });

  it('strong_arm: throws go 30% further and faster', () => {
    const p = game(['quartermaster'], [[0, 'strong_arm']]).p(0);
    expect(p.stats.throwRange).toBeCloseTo(quartermaster.supply.throwRange * 1.3, 6);
    expect(p.stats.throwSpeed).toBeCloseTo(quartermaster.supply.throwSpeed * 1.3, 6);
  });

  it('venom_bolts: a bolt hit poisons the enemy', () => {
    const run = (picks: Pick[]) => {
      const h = game(['quartermaster'], picks);
      h.put(0, 10, 16);
      const e = h.sim.spawnEnemy('grunt', 12.5, 16);
      e.hp = e.maxHp = 1e6;
      h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
      h.run(30);
      const hit = e.hp;
      h.run(90);
      return { fx: effectOf(e, 'poison'), later: e.hp, hit };
    };
    expect(run([]).fx).toBeUndefined();
    const on = run([[0, 'venom_bolts']]);
    expect(on.fx!.strength).toBe(2);
    expect(on.later).toBeLessThan(on.hit);
  });

  it('overflow: healing a full-HP player gives a shield that absorbs damage', () => {
    const run = (picks: Pick[]) => {
      const h = game(['quartermaster', 'engineer'], picks);
      h.put(0, 10, 16);
      h.put(1, 11, 16);
      h.run(MEDIC);
      return h;
    };
    expect(effectOf(run([]).p(1), 'shield')).toBeUndefined();
    const h = run([[0, 'overflow']]);
    const shield = effectOf(h.p(1), 'shield')!;
    expect(shield.strength).toBeCloseTo(quartermaster.passive.params.heal, 6);
    // A hit eats the shield, not the HP.
    shield.strength = 40;
    h.sim.command({ c: 'debug', slot: 1, action: 'invincible', on: false });
    h.sim.spawnEnemy('grunt', 11.3, 16);
    h.run(90);
    expect(h.p(1).hp).toBe(h.p(1).maxHp);
    expect(effectOf(h.p(1), 'shield')!.strength).toBeLessThan(40);
  });

  it('bulk_buyer: every 3rd crate bought is free', () => {
    const spent = (picks: Pick[]) => {
      const h = harness(1, 1, { classes: ['quartermaster'] });
      h.toBuild();
      for (const [slot, card] of picks) h.give(slot, card);
      h.sim.world.team.coins = 100;
      h.put(0, 22.5, 1.5);
      for (let i = 0; i < 6; i++) {
        h.pads[0]!.tap('actionTaps');
        h.run(1);
      }
      expect(h.p(0).crates).toBe(6);
      return 100 - h.sim.world.team.coins;
    };
    expect(spent([])).toBe(6);
    expect(spent([[0, 'bulk_buyer']])).toBe(4);
  });

  it('wide_aura: Field Medic reaches 30% further', () => {
    const healed = (picks: Pick[]) => {
      const h = game(['quartermaster', 'engineer'], picks);
      h.put(0, 10, 16);
      h.put(1, 13.1, 16);
      h.p(1).hp = 50;
      h.run(MEDIC);
      return h.p(1).hp - 50;
    };
    expect(healed([])).toBe(0);
    expect(healed([[0, 'wide_aura']])).toBe(3);
    expect(atk(game(['quartermaster'], [[0, 'wide_aura']]).p(0), 2.5, 'auraRadius')).toBeCloseTo(
      3.25,
      6,
    );
  });

  it('triage: heals on a player below 30% HP are doubled', () => {
    const healed = (picks: Pick[], hp: number) => {
      const h = game(['quartermaster', 'engineer'], picks);
      h.put(0, 10, 16);
      h.put(1, 11, 16);
      h.p(1).hp = hp;
      h.run(MEDIC);
      return h.p(1).hp - hp;
    };
    expect(healed([], 20)).toBe(3);
    expect(healed([[0, 'triage']], 20)).toBe(6);
    expect(healed([[0, 'triage']], 50)).toBe(3);
  });

  it('plague: a poisoned enemy that dies passes poison to a neighbor', () => {
    const neighborPoisoned = (picks: Pick[]) => {
      const h = game(['quartermaster'], picks);
      h.put(0, 10, 16);
      const a = h.sim.spawnEnemy('grunt', 12.5, 16);
      const b = h.sim.spawnEnemy('grunt', 12.5, 17.1);
      a.hp = 12;
      h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
      h.run(150);
      expect(a.hp).toBeLessThanOrEqual(0);
      return effectOf(b, 'poison') !== undefined;
    };
    expect(neighborPoisoned([[0, 'venom_bolts']])).toBe(false);
    expect(
      neighborPoisoned([
        [0, 'venom_bolts'],
        [0, 'plague'],
      ]),
    ).toBe(true);
  });
});

// ---- commander ----------------------------------------------------------------------------------

describe('commander cards', () => {
  /** The first hit one of slot 0's soldiers lands on `kind`, with `lost` soldiers killed first. */
  function soldierHit(kind: 'grunt' | 'siege', picks: Pick[], lost = 0): number {
    const h = game(['commander'], picks);
    h.put(0, 10, 12);
    h.run(60);
    const squad = () => h.sim.world.soldiers.filter((u) => u.owner === 0);
    const ids = new Set(squad().map((u) => u.id));
    for (const u of squad().slice(0, lost)) u.hp = 0;
    h.run(1);
    const e = h.sim.spawnEnemy(kind, 10, 13);
    e.hp = e.maxHp = 1e6;
    const hits = h
      .collect('damage', 120)
      .filter((d) => d.target === e.id && ids.has(d.source ?? -1));
    expect(hits.length).toBeGreaterThan(0);
    return hits[0]!.amount;
  }

  it('bladework: the slash arc is 20% wider', () => {
    const p = game(['commander'], [[0, 'bladework']]).p(0);
    expect(atk(p, 110, 'arcDeg', 'main')).toBeCloseTo(132, 6);
    expect(atk(p, 110, 'arcDeg', 'super')).toBeCloseTo(110, 6);
  });

  it('forced_march: his soldiers get haste', () => {
    const run = (picks: Pick[]) => {
      const h = game(['commander'], picks);
      h.run(5);
      return h.sim.world.soldiers.filter((u) => u.owner === 0);
    };
    for (const u of run([])) expect(effectOf(u, 'haste')).toBeUndefined();
    const on = run([[0, 'forced_march']]);
    expect(on).toHaveLength(3);
    for (const u of on) {
      expect(effectOf(u, 'haste')!.strength).toBeCloseTo(0.2, 6);
      expect(u.stats.moveSpeed).toBeGreaterThan(4.4 * 1.19);
    }
  });

  it('rally_cry: his super effects last 30% longer', () => {
    const morale = (picks: Pick[]) => {
      const h = game(['commander'], picks);
      h.p(0).superCharge = 1;
      h.pads[0]!.tap('superFires');
      h.run(2);
      return effectOf(h.p(0), 'morale')!.remaining;
    };
    expect(morale([[0, 'rally_cry']]) / morale([])).toBeCloseTo(1.3, 1);
  });

  it('siege_breakers: the squad deals +50% to Siege only', () => {
    const base = soldierHit('siege', []);
    expect(soldierHit('siege', [[0, 'siege_breakers']])).toBeCloseTo(base * 1.5, 6);
    expect(soldierHit('grunt', [[0, 'siege_breakers']])).toBeCloseTo(soldierHit('grunt', []), 6);
  });

  it('veterans: soldiers alive at the end of a wave gain a rank and max HP in the next build', () => {
    const h = game(['commander'], [[0, 'veterans']]);
    h.run(30);
    const squad = () => h.sim.world.soldiers.filter((u) => u.owner === 0);
    expect(squad().map((u) => u.veterans)).toEqual([0, 0, 0]);
    h.sim.world.spawns.length = 0;
    h.until(() => h.sim.world.phase === 'build', 10);
    h.run(3);
    expect(squad().map((u) => u.veterans)).toEqual([1, 1, 1]);
    for (const u of squad()) expect(u.maxHp).toBeCloseTo(60 * 1.1, 6);
  });

  it('last_stand: the squad hits harder for each soldier lost', () => {
    const full = soldierHit('grunt', [[0, 'last_stand']], 0);
    expect(soldierHit('grunt', [[0, 'last_stand']], 1)).toBeCloseTo(full * 1.15, 6);
    expect(soldierHit('grunt', [], 1)).toBeCloseTo(full, 6);
  });

  it('vanguard: the Commander gets an aura while a soldier is near', () => {
    const run = (picks: Pick[]) => {
      const h = game(['commander'], picks);
      h.put(0, 10, 12);
      h.run(240);
      return h.p(0);
    };
    expect(effectOf(run([]), 'aura_vanguard')).toBeUndefined();
    const p = run([[0, 'vanguard']]);
    expect(effectOf(p, 'aura_vanguard')).toBeDefined();
    expect(p.stats.damageReduction).toBeCloseTo(0.2, 6);
  });

  it('warcry: his super also gives morale to a nearby other player', () => {
    const run = (picks: Pick[]) => {
      const h = game(['commander', 'engineer', 'engineer'], picks);
      h.put(0, 10, 12);
      h.put(1, 12, 12);
      h.put(2, 25, 12);
      h.p(0).superCharge = 1;
      h.pads[0]!.tap('superFires');
      h.run(2);
      return h;
    };
    expect(effectOf(run([]).p(1), 'morale')).toBeUndefined();
    const h = run([[0, 'warcry']]);
    expect(effectOf(h.p(1), 'morale')!.strength).toBeCloseTo(0.2, 6);
    expect(effectOf(h.p(2), 'morale')).toBeUndefined();
  });
});
