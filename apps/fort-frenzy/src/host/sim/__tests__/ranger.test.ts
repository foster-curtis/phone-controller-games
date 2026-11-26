// The Ranger's kit (SPEC §6.1, §7.4, §8.2; RD7): mines (cap, trigger, Flyers, burst, charging), his
// build cards, Steady Aim as a card with Deadeye behind it, and regen against his main and super.
import { describe, expect, it } from 'vitest';
import { content, type Content } from '../../../content';
import { classes, mine, ranger } from '../../../content/balance';
import type { CardDef } from '../../../content/types';
import type { CardId, EnemyId } from '../../../shared/ids';
import { buildEffectRadius } from '../preview';
import { eligibleFor } from '../cards';
import { createCatalog } from '../catalog';
import { runHarness } from '../balance/harness';
import { AutopilotInputSource } from '../sources';
import type { BuildEnt, EnemyEnt } from '../types';
import { harness, type Harness } from './harness';

const steps = (ms: number) => Math.max(1, Math.round((ms * 60) / 1000));
const ARM = steps(mine.armMs);
const TRIGGER = steps(mine.triggerMs);
const BAND = classes.find((c) => c.id === 'marksman')!.damage;
/** The knight waits here, away from anything the tests spawn. */
const AWAY = { x: 30, y: 6 };
const AT = { x: 10, y: 16 };

/** Content with the Ranger's meter rates replaced (no passive fill unless asked for). */
const meterContent = (perSec = 0, perPoint = 0.0015): Content => ({
  ...content,
  knights: content.knights.map((k) =>
    k.id === 'ranger' ? { ...k, meter: { ...k.meter, perSec, perPoint } } : k,
  ),
});

function game(cards: CardId[] = [], c?: Content): Harness {
  const h = harness(1, 1, { classes: ['ranger'], content: c });
  if (cards.length > 0) {
    h.toBuild();
    for (const card of cards) h.give(0, card);
  }
  h.toCombat();
  h.holdSpawns();
  h.put(0, AWAY.x, AWAY.y);
  return h;
}

const mines = (h: Harness) => h.sim.world.builds.filter((b) => b.kind === 'mine');

/** Places a mine at (x, y) with a full meter and walks the knight away. */
function place(h: Harness, x = AT.x, y = AT.y): BuildEnt {
  h.put(0, x, y);
  h.p(0).meter = 1;
  h.pads[0]!.tap('buildFires');
  h.run(1);
  h.put(0, AWAY.x, AWAY.y);
  const all = mines(h);
  return all[all.length - 1]!;
}

function armed(h: Harness, x = AT.x, y = AT.y): BuildEnt {
  const b = place(h, x, y);
  h.run(ARM + 1);
  expect(b.state).toBe('active');
  return b;
}

function foe(h: Harness, kind: EnemyId, x: number, y: number, hp = 1e6): EnemyEnt {
  const e = h.sim.spawnEnemy(kind, x, y);
  e.hp = e.maxHp = hp;
  e.stats.moveSpeed = 0;
  return e;
}

/** Steps until `kind` is emitted; how many steps that took. */
function stepsTo(h: Harness, kind: 'mineTrigger' | 'mineBurst', max = 240): number {
  for (let i = 1; i <= max; i++) {
    h.sim.step();
    if (h.events(kind).length > 0) return i;
  }
  throw new Error(`no ${kind} in ${max} steps`);
}

describe('placing mines (§7.4)', () => {
  it('goes down at his feet, empties the meter and arms after armMs', () => {
    const h = game();
    const b = place(h);
    expect({ x: b.x, y: b.y }).toEqual(AT);
    expect(h.p(0).meter).toBeLessThan(0.01);
    expect(b.charges).toBe(1);
    expect(b.targetable).toBe(false);
    expect(b.state).toBe('landed');
    h.run(ARM - 2);
    expect(b.state).toBe('landed');
    h.run(3);
    expect(b.state).toBe('active');
  });

  it('needs a full meter', () => {
    const h = game();
    h.p(0).meter = 0.9;
    h.pads[0]!.tap('buildFires');
    h.run(1);
    expect(mines(h)).toHaveLength(0);
  });

  it('a 4th mine removes the oldest', () => {
    const h = game();
    const first = place(h, 8, 16);
    const second = place(h, 10, 16);
    const third = place(h, 12, 16);
    expect(mines(h)).toHaveLength(3);
    const fourth = place(h, 14, 16);
    expect(mines(h).map((b) => b.id)).toEqual([second.id, third.id, fourth.id]);
    expect(mines(h).some((b) => b.id === first.id)).toBe(false);
  });

  it('Minefield raises the cap to 4; a 5th removes the oldest', () => {
    const h = game(['minefield']);
    const first = place(h, 6, 16);
    for (const x of [8, 10, 12]) place(h, x, 16);
    expect(mines(h)).toHaveLength(4);
    place(h, 14, 16);
    expect(mines(h)).toHaveLength(4);
    expect(mines(h).some((b) => b.id === first.id)).toBe(false);
  });

  it('enemies never target a mine', () => {
    const h = game();
    const b = armed(h);
    const g = h.sim.spawnEnemy('grunt', AT.x + 4, AT.y);
    h.run(10);
    expect(g.target).not.toBe(b.id);
  });
});

describe('the trigger (§7.4)', () => {
  it('a ground enemy inside the trigger radius sets it off, then it bursts after the delay in steps', () => {
    const h = game();
    const b = armed(h);
    const g = foe(h, 'grunt', AT.x + 5, AT.y);
    h.run(30);
    expect(b.triggerAt).toBeNull();
    g.x = AT.x + mine.triggerRadius;
    stepsTo(h, 'mineTrigger');
    expect(b.triggerAt).toBe(h.sim.world.tick - 1 + TRIGGER);
    expect(stepsTo(h, 'mineBurst')).toBe(TRIGGER);
    expect(h.events('buildGone')).toEqual([
      expect.objectContaining({ build: b.id, kind: 'mine', destroyed: false }),
    ]);
    expect(mines(h)).toHaveLength(0);
  });

  it('does nothing while it is still arming', () => {
    const h = game();
    const b = place(h);
    foe(h, 'grunt', AT.x + 0.5, AT.y);
    h.run(ARM - 2);
    expect(b.triggerAt).toBeNull();
  });

  it('Flyers never trigger it, and its burst passes under them', () => {
    const h = game();
    const b = armed(h);
    const f = foe(h, 'flyer', AT.x + 0.2, AT.y, 500);
    h.run(120);
    expect(b.triggerAt).toBeNull();
    expect(mines(h)).toHaveLength(1);
    foe(h, 'grunt', AT.x + 0.4, AT.y);
    stepsTo(h, 'mineBurst');
    expect(f.hp).toBe(500);
  });

  it('a Runner sets it off like any ground enemy', () => {
    const h = game();
    const b = armed(h);
    foe(h, 'runner', AT.x + 0.5, AT.y);
    h.run(2);
    expect(b.triggerAt).not.toBeNull();
  });

  it('keeps its charge when the wave ends during the delay, and works again next wave', () => {
    const h = game();
    const b = armed(h);
    foe(h, 'grunt', AT.x + 0.5, AT.y);
    stepsTo(h, 'mineTrigger');
    h.sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: 2 });
    h.toBuild();
    h.run(1);
    expect(b.triggerAt).toBeNull();
    expect(b.charges).toBe(1);
    h.toCombat();
    h.holdSpawns();
    for (const e of h.sim.world.enemies) e.hp = 0;
    h.run(2);
    expect(mines(h)).toEqual([b]);
    expect(b.triggerAt).toBeNull();
    foe(h, 'grunt', AT.x + 0.5, AT.y);
    stepsTo(h, 'mineTrigger');
    expect(stepsTo(h, 'mineBurst')).toBe(TRIGGER);
  });

  it('two mines bursting on one step are both removed', () => {
    const h = game();
    armed(h, 10, 16);
    armed(h, 10.5, 16);
    foe(h, 'grunt', 10.25, 16);
    stepsTo(h, 'mineBurst');
    expect(h.events('mineBurst')).toHaveLength(2);
    expect(mines(h)).toHaveLength(0);
  });
});

describe('the burst (§7.2, §7.4)', () => {
  it('deals area damage to ground enemies in the radius and knocks them away', () => {
    const h = game();
    armed(h);
    const near = foe(h, 'grunt', AT.x + 0.5, AT.y);
    const inRange = foe(h, 'grunt', AT.x + mine.radius, AT.y);
    const out = foe(h, 'grunt', AT.x + mine.radius + 2, AT.y);
    stepsTo(h, 'mineBurst');
    expect(near.maxHp - near.hp).toBe(mine.damage);
    expect(inRange.maxHp - inRange.hp).toBe(mine.damage);
    expect(out.hp).toBe(out.maxHp);
    expect(near.push?.x ?? 0).toBeGreaterThan(0);
  });

  it('charges the super, never the meter', () => {
    const h = game([], meterContent());
    armed(h);
    h.p(0).meter = 0;
    h.p(0).superCharge = 0;
    foe(h, 'grunt', AT.x + 0.5, AT.y);
    stepsTo(h, 'mineBurst');
    expect(h.p(0).superCharge).toBeCloseTo(mine.damage * ranger.superCharge.perDamage, 9);
    expect(h.p(0).meter).toBe(0);
  });

  it('his main charges the meter, so mines come from shooting too', () => {
    const h = game([], meterContent());
    h.p(0).meter = 0;
    foe(h, 'grunt', AWAY.x + 3, AWAY.y);
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    h.run(30);
    expect(h.p(0).meter).toBeCloseTo(ranger.main.damage * BAND * 0.0015, 9);
  });
});

describe('build cards (§6.1)', () => {
  it('Shrapnel Charge: shorter delay, wider blast', () => {
    const h = game(['shrapnel_charge']);
    const b = armed(h);
    const far = foe(h, 'grunt', AT.x + mine.radius * 1.15, AT.y);
    foe(h, 'grunt', AT.x + 0.5, AT.y);
    stepsTo(h, 'mineTrigger');
    expect(b.triggerAt! - (h.sim.world.tick - 1)).toBe(steps(mine.triggerMs * 0.8));
    stepsTo(h, 'mineBurst');
    expect(far.hp).toBeLessThan(far.maxHp);
    expect(buildEffectRadius(h.p(0), mine, content)).toBeCloseTo(mine.radius * 1.2, 9);
  });

  it("the delay never drops below the mine's floor", () => {
    const h = harness(1, 1, { classes: ['ranger'] });
    h.toBuild();
    h.give(0, 'shrapnel_charge', 5);
    h.toCombat();
    h.holdSpawns();
    h.put(0, AWAY.x, AWAY.y);
    const b = armed(h);
    foe(h, 'grunt', AT.x + 0.5, AT.y);
    stepsTo(h, 'mineTrigger');
    expect(b.triggerAt! - (h.sim.world.tick - 1)).toBe(
      steps((mine.module.params as { minTriggerMs: number }).minTriggerMs),
    );
  });
});

describe('Steady Aim and Deadeye (§6.1)', () => {
  const cat = createCatalog(content, 'normal');
  const def = (id: CardId) => content.cards.find((c) => c.id === id)! as CardDef;
  const eligible = (h: Harness, id: CardId) => eligibleFor(cat, h.sim.world, h.p(0))(def(id));

  it('no knight has a built-in passive for him: Steady Aim is a rare, unique card', () => {
    expect((ranger as { passive?: unknown }).passive).toBeUndefined();
    expect(def('steady_aim')).toMatchObject({ owner: 'ranger', tier: 'rare', unique: true });
  });

  it('Deadeye is excluded until Steady Aim is owned, then stacks', () => {
    const h = harness(1, 1, { classes: ['ranger'] });
    h.toBuild();
    expect(eligible(h, 'steady_aim')).toBe(true);
    expect(eligible(h, 'deadeye')).toBe(false);
    h.give(0, 'steady_aim');
    expect(eligible(h, 'steady_aim')).toBe(false);
    expect(eligible(h, 'deadeye')).toBe(true);
    h.give(0, 'deadeye');
    expect(eligible(h, 'deadeye')).toBe(true);
  });

  it('Minefield is unique', () => {
    const h = harness(1, 1, { classes: ['ranger'] });
    h.toBuild();
    h.give(0, 'minefield');
    expect(eligible(h, 'minefield')).toBe(false);
  });
});

describe('regen against his kit (§5, RC1)', () => {
  const DELAY = steps(content.rules!.regen.delayMs);

  function hurt(c?: Content) {
    const h = game([], c);
    h.p(0).hp = h.p(0).maxHp * 0.5;
    h.p(0).regen.quietUntil = 0;
    h.p(0).regen.nextRegen = 0;
    return h;
  }

  /** The step offsets (from now) at which his HP rises, over `n` steps. */
  function rises(h: Harness, n: number): number[] {
    const out: number[] = [];
    for (let i = 1; i <= n; i++) {
      const before = h.p(0).hp;
      h.sim.step();
      if (h.p(0).hp > before) out.push(i);
    }
    return out;
  }

  it('the longbow restarts the wait', () => {
    const h = hurt();
    h.pads[0]!.tap('mainFires', { mainAim: { x: 1, y: 0 } });
    h.sim.step();
    expect(rises(h, DELAY)).toEqual([DELAY]);
  });

  it('the shockwave restarts the wait', () => {
    const h = hurt();
    h.p(0).superCharge = 1;
    h.pads[0]!.tap('superFires');
    h.sim.step();
    expect(h.p(0).superCharge).toBe(0);
    expect(rises(h, DELAY)).toEqual([DELAY]);
  });

  it('placing a mine does not', () => {
    const h = hurt();
    h.p(0).regen.quietUntil = h.sim.world.tick + 30;
    h.p(0).regen.nextRegen = h.p(0).regen.quietUntil;
    h.p(0).meter = 1;
    h.pads[0]!.tap('buildFires');
    h.sim.step();
    expect(mines(h)).toHaveLength(1);
    expect(rises(h, 30)).toEqual([30]);
  });

  it("a mine's burst does not", () => {
    const h = game();
    armed(h);
    foe(h, 'grunt', AT.x + 0.5, AT.y);
    const q = h.sim.world.tick + 7;
    h.p(0).hp = h.p(0).maxHp * 0.5;
    h.p(0).regen.quietUntil = h.p(0).regen.nextRegen = q;
    stepsTo(h, 'mineBurst');
    expect(h.p(0).regen.quietUntil).toBe(q);
  });
});

describe('autopilot and balance report', () => {
  it('the balance report runs the Ranger with his build policy', () => {
    const r = runHarness(content, [1]);
    expect(r.rows.find((x) => x.knight === 'ranger')!.builds).toBe(true);
  });

  it('the autopilot places mines in a real wave', () => {
    const h = harness(1, 1, { classes: ['ranger'] });
    h.sim.setSource(0, new AutopilotInputSource(() => h.sim.world, 0));
    h.toCombat();
    let placed = 0;
    for (let i = 0; i < 60 * 40 && h.sim.world.phase === 'combat'; i++) {
      h.sim.step();
      placed += h.events('buildPlaced').length;
    }
    expect(placed).toBeGreaterThan(0);
  });
});
