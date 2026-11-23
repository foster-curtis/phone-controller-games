// Upgrade card scenarios (SPEC §6.1): one test per card, picked through the real `card` command
// (harness `give`), plus stacking (×N) and the stat caps.
import { describe, expect, it } from 'vitest';
import { cards as cardDefs, classes, ranger, flyer, rules, warden } from '../../../content/balance';
import type { RulesDef, StatId } from '../../../content/types';
import { CARD_IDS, type CardId, type ClassId } from '../../../shared/ids';
import { collectStatMods, statValue } from '../../systems/modifiers';
import { groundBody } from '../body';
import { harness, type Harness } from './harness';
import type { PlayerEnt } from '../types';

const steps = (ms: number) => Math.max(1, Math.round((ms * 60) / 1000));
const COOLDOWN = steps(ranger.main.cooldownMs) + 2;
/** The Ranger's longbow after the marksman's damage band (§8.1). */
const RANGER_MAIN = ranger.main.damage * classes.find((c) => c.id === 'marksman')!.damage;

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

/** Fires the Ranger's main (not Steady: a barely moving stick) along +x from (10, 16). */
function shoot(h: Harness, slot = 0) {
  h.put(slot, 10, 16);
  h.p(slot).stillTicks = 0;
  h.pads[slot]!.set({ move: { x: 0.001, y: 0 } });
  h.run(1);
  h.pads[slot]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
  h.run(1);
}

describe('card coverage', () => {
  it('has a def for every card id, once, except the ones their milestones add (RD7–RD11)', () => {
    const pending = ['tinkerer', 'wide_field', 'challenger', 'reinforced_generator', 'fault_line'];
    expect(cardDefs.map((c) => c.id).sort()).toEqual(
      CARD_IDS.filter((id) => !pending.includes(id)).sort(),
    );
  });
});

// ---- shared commons -----------------------------------------------------------------------------

type Common = { stat: StatId; pct: boolean; by: Record<ClassId, number> };
const per = (pct: boolean, stat: StatId, e: number, w: number, q: number, c: number): Common => ({
  stat,
  pct,
  by: { ranger: e, warden: w, artificer: q, commander: c },
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
const CLASSES: ClassId[] = ['ranger', 'warden', 'artificer', 'commander'];

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
    const h = harness(1, 1, { classes: ['ranger'] });
    h.toBuild();
    h.give(0, 'vitality');
    expect(h.p(0).maxHp).toBeCloseTo(rules.knightHp * 0.8 * 1.12, 6);
    expect(h.p(0).hp).toBeCloseTo(h.p(0).maxHp, 6);
  });

  it('stacks add: two Might picks give twice the bonus', () => {
    const h = harness(1, 1, { classes: ['ranger'] });
    h.toBuild();
    h.give(0, 'might');
    expect(atk(h.p(0), 100, 'damage', 'main')).toBeCloseTo(110, 6);
    h.give(0, 'might');
    expect(h.p(0).cards.might).toBe(2);
    expect(atk(h.p(0), 100, 'damage', 'main')).toBeCloseTo(120, 6);
  });

  it('reach is capped at +40% range', () => {
    const h = harness(1, 1, { classes: ['ranger'] });
    h.toBuild();
    h.give(0, 'reach', 10);
    expect(atk(h.p(0), ranger.main.range, 'range', 'main')).toBeCloseTo(ranger.main.range * 1.4, 6);
  });

  it('swiftness is capped at +40% move speed', () => {
    const h = harness(1, 1, { classes: ['ranger'] });
    h.toBuild();
    h.give(0, 'swiftness', 10);
    expect(h.p(0).stats.moveSpeed).toBeCloseTo(ranger.moveSpeed * 1.4, 6);
  });

  it('toughness is capped at 0.4 damage reduction', () => {
    const h = harness(1, 1, { classes: ['ranger'] });
    h.toBuild();
    h.give(0, 'toughness', 10);
    expect(h.p(0).stats.damageReduction).toBeCloseTo(0.4, 6);
  });

  it('quick_recovery takes 2 s a stack off the respawn stat (the floors: scaling.test)', () => {
    const h = harness(1, 1, { classes: ['ranger'] });
    h.toBuild();
    const base = h.p(0).stats.respawnMs;
    h.give(0, 'quick_recovery', 2);
    expect(h.p(0).stats.respawnMs).toBe(base - 4000);
  });
});

// ---- ranger -----------------------------------------------------------------------------------

describe('ranger cards', () => {
  it('quick_draw: main bolts fly 25% faster', () => {
    const speed = (picks: Pick[]) => {
      const h = game(['ranger'], picks);
      shoot(h);
      const b = h.sim.world.projectiles[0]!;
      return Math.hypot(b.vx, b.vy);
    };
    expect(speed([[0, 'quick_draw']]) / speed([])).toBeCloseTo(1.25, 6);
  });

  it('blast_radius: the super circle is 20% wider', () => {
    const hit = (picks: Pick[]) => {
      const h = game(['ranger'], picks);
      h.put(0, 10, 16);
      // Edge at 1.1× the base radius: outside the base circle, inside the 1.2× one.
      const e = h.sim.spawnEnemy('grunt', 0, 16);
      e.x = 10 + ranger.super.radius * 1.1 + e.r;
      h.p(0).superCharge = 1;
      h.pads[0]!.tap('superFires');
      h.run(1);
      return e.hp < e.maxHp;
    };
    expect(hit([])).toBe(false);
    expect(hit([[0, 'blast_radius']])).toBe(true);
  });

  it('fire_arrows: a main hit sets the enemy burning and it takes damage over time', () => {
    const h = game(['ranger'], [[0, 'fire_arrows']]);
    shoot(h);
    const e = h.sim.spawnEnemy('grunt', 14, 16);
    h.run(30);
    expect(effectOf(e, 'burn')).toBeDefined();
    const afterHit = e.hp;
    expect(afterHit).toBe(e.maxHp - RANGER_MAIN);
    h.run(90);
    expect(e.hp).toBeLessThan(afterHit);
  });

  it('piercing_shot: one bolt hits two enemies in a line', () => {
    const second = (picks: Pick[]) => {
      const h = game(['ranger'], picks);
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
      const h = game(['ranger'], picks);
      shoot(h);
      // Its body flies over its shadow (C4): the shot along y = 16 meets the body.
      const f = h.sim.spawnEnemy('flyer', 14, 16 + groundBody(flyer.body).lo);
      f.hp = f.maxHp = 1e6;
      h.run(30);
      return f.maxHp - f.hp;
    };
    const base = dealt([]);
    expect(base).toBe(RANGER_MAIN);
    expect(dealt([[0, 'skyhunter']])).toBeCloseTo(base * 1.5, 6);
  });

  it('deadeye: Steady Aim kicks in after 360 ms instead of 600 ms', () => {
    const both: Pick[] = [
      [0, 'steady_aim'],
      [0, 'deadeye'],
    ];
    expect(atk(game(['ranger'], both).p(0), 600, 'durationMs', 'passive')).toBeCloseTo(360, 6);
    const dealt = (picks: Pick[]) => {
      const h = game(['ranger'], picks);
      h.put(0, 10, 16);
      h.p(0).stillTicks = 0;
      h.run(steps(450));
      const e = h.sim.spawnEnemy('grunt', 13, 16);
      e.hp = e.maxHp = 1e6;
      h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
      h.run(30);
      return e.maxHp - e.hp;
    };
    expect(dealt([[0, 'steady_aim']])).toBe(RANGER_MAIN);
    expect(dealt(both)).toBeCloseTo(RANGER_MAIN * 1.25, 6);
  });

  it('volley: every 4th main shot fires 3 bolts', () => {
    const h = game(['ranger'], [[0, 'volley']]);
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
      const h = game(['ranger'], picks);
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

  it('aftershock: the jump slam slows what it hits for slowMs; the main no longer slows', () => {
    const params = cardDefs.find((c) => c.id === 'aftershock')!.module!.params!;
    const slowMs = params.slowMs as number;
    expect(slowMs).toBe(5000);
    const slowed = (picks: Pick[], slot: 'main' | 'super') => {
      const h = game(['warden'], picks);
      h.put(0, 10, 12);
      const e = h.sim.spawnEnemy('grunt', 11.2, 12);
      if (slot === 'super') {
        h.p(0).superCharge = 1;
        h.pads[0]!.tap('superFires', { superAim: { x: 1, y: 0 } });
        h.run(1 + steps(warden.super.windupMs));
      } else {
        h.pads[0]!.tap('mainFires');
        h.run(slamWindup + 10);
      }
      return effectOf(e, 'slow');
    };
    expect(slowed([], 'super')).toBeUndefined();
    expect(slowed([[0, 'aftershock']], 'main')).toBeUndefined();
    const slow = slowed([[0, 'aftershock']], 'super')!;
    expect(slow.strength).toBeCloseTo(params.slow as number, 6);
    expect(slow.remaining).toBeGreaterThanOrEqual(steps(slowMs) - 2);
    expect(slow.remaining).toBeLessThanOrEqual(steps(slowMs));
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
});

// ---- artificer ------------------------------------------------------------------------------

describe('artificer cards', () => {
  const MEDIC = steps(1000) + 1;

  it('venom_bolts: a bolt hit poisons the enemy', () => {
    const run = (picks: Pick[]) => {
      const h = game(['artificer'], picks);
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
      const h = game(['artificer', 'ranger'], picks);
      h.put(0, 10, 16);
      h.put(1, 11, 16);
      h.run(MEDIC);
      return h;
    };
    expect(effectOf(run([[0, 'field_medic']]).p(1), 'shield')).toBeUndefined();
    const h = run([
      [0, 'field_medic'],
      [0, 'overflow'],
    ]);
    const shield = effectOf(h.p(1), 'shield')!;
    expect(shield.strength).toBeCloseTo(3, 6);
    // A hit eats the shield, not the HP.
    shield.strength = 40;
    h.sim.command({ c: 'debug', slot: 1, action: 'invincible', on: false });
    h.sim.spawnEnemy('grunt', 11.3, 16);
    h.run(90);
    expect(h.p(1).hp).toBe(h.p(1).maxHp);
    expect(effectOf(h.p(1), 'shield')!.strength).toBeLessThan(40);
  });

  it('wide_aura: Field Medic reaches 30% further', () => {
    const healed = (picks: Pick[]) => {
      const h = game(['artificer', 'ranger'], picks);
      h.put(0, 10, 16);
      h.put(1, 13.1, 16);
      h.p(1).hp = 50;
      h.p(1).regen.quietUntil = 1e9; // only Field Medic heals (no delayed regen, §5)
      h.run(MEDIC);
      return h.p(1).hp - 50;
    };
    expect(healed([[0, 'field_medic']])).toBe(0);
    expect(
      healed([
        [0, 'field_medic'],
        [0, 'wide_aura'],
      ]),
    ).toBe(3);
    expect(atk(game(['artificer'], [[0, 'wide_aura']]).p(0), 2.5, 'auraRadius')).toBeCloseTo(
      3.25,
      6,
    );
  });

  it('triage: heals on a player below 30% HP are doubled', () => {
    const healed = (picks: Pick[], hp: number) => {
      const h = game(['artificer', 'ranger'], picks);
      h.put(0, 10, 16);
      h.put(1, 11, 16);
      h.p(1).hp = hp;
      h.p(1).regen.quietUntil = 1e9; // only Field Medic heals (no delayed regen, §5)
      h.run(MEDIC);
      return h.p(1).hp - hp;
    };
    const medic: Pick = [0, 'field_medic'];
    expect(healed([medic], 20)).toBe(3);
    expect(healed([medic, [0, 'triage']], 20)).toBe(6);
    expect(healed([medic, [0, 'triage']], 50)).toBe(3);
  });

  it('plague: a poisoned enemy that dies passes poison to a neighbor', () => {
    const neighborPoisoned = (picks: Pick[]) => {
      const h = game(['artificer'], picks);
      h.put(0, 10, 16);
      const a = h.sim.spawnEnemy('grunt', 12.5, 16);
      // North of it, clear of the bolts' fan (its body reaches up the screen, away from them, C4).
      const b = h.sim.spawnEnemy('grunt', 12.5, 14.6);
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

  it('forced_march: his soldiers walk faster (the squad speed stat)', () => {
    const walk = (picks: Pick[]) => {
      const h = game(['commander'], picks);
      const u = h.sim.world.soldiers.find((x) => x.owner === 0)!;
      h.p(0).flag = { x: 30, y: 14 };
      u.mode = 'rally';
      u.x = 28;
      u.y = 14;
      h.run(1);
      return Math.hypot(u.vx, u.vy);
    };
    expect(walk([[0, 'forced_march']]) / walk([])).toBeCloseTo(1.2, 6);
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
    expect(squad().map((u) => u.veterans)).toEqual([0, 0]);
    h.sim.world.spawns.length = 0;
    h.until(() => h.sim.world.phase === 'build', 10);
    h.run(3);
    expect(squad().map((u) => u.veterans)).toEqual([1, 1]);
    for (const u of squad()) expect(u.maxHp).toBeCloseTo(60 * 1.1, 6);
  });

  it('last_stand: the squad hits harder for each soldier lost', () => {
    // Counted from the cap (4): the starting 2 are already 2 short.
    const plain = soldierHit('grunt', [], 0);
    const two = soldierHit('grunt', [[0, 'last_stand']], 0);
    expect(two).toBeCloseTo(plain * 1.3, 6);
    expect(soldierHit('grunt', [[0, 'last_stand']], 1)).toBeCloseTo(plain * 1.45, 6);
    expect(soldierHit('grunt', [], 1)).toBeCloseTo(plain, 6);
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
      const h = game(['commander', 'ranger', 'ranger'], picks);
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
