// Per-wave class growth (SPEC §6.1, §8.1; RD11): every wave's end adds the class's growth list, the
// bigger `boss` list after waves 5 and 10; additive like the cards; never a capped stat; the growth
// header on the card pop-up; Tinkerer's faster build meter.
import { describe, expect, it } from 'vitest';
import { content, type Content } from '../../../content';
import { classes, knights } from '../../../content/balance';
import type { StatMod } from '../../../content/types';
import type { ClassId } from '../../../shared/ids';
import { growthFor } from '../../net/views';
import { harness, type Harness } from './harness';

const roleOf = (k: ClassId) => knights.find((x) => x.id === k)!.role;
const growthOf = (k: ClassId) => classes.find((c) => c.id === roleOf(k))!.growth;
const pct = (mods: readonly StatMod[], stat: string) =>
  mods.filter((m) => m.stat === stat).reduce((n, m) => n + (m.addPct ?? 0), 0);

/** Clears the current wave at once (nothing left to spawn or kill); returns at the next build phase. */
function clearWave(h: Harness) {
  if (h.sim.world.phase !== 'combat') h.toCombat();
  for (const e of h.sim.world.enemies) e.hp = 0;
  h.sim.world.spawns.length = 0;
  h.until(() => h.sim.world.phase === 'build', 10);
}

/** The knight's main damage as the sim reads it (class band × the cards and growth). */
function damageMult(h: Harness, slot = 0): number {
  const p = h.p(slot);
  let pctSum = 0;
  for (const m of p.mods)
    for (const s of m.stats ?? [])
      if (s.stat === 'damage' && (s.scope === undefined || s.scope === 'main'))
        pctSum += s.addPct ?? 0;
  return 1 + pctSum;
}

describe('class growth at the wave end', () => {
  for (const k of ['warden', 'ranger', 'artificer', 'commander'] as ClassId[]) {
    it(`the ${k} gets its class's stats when wave 1 ends`, () => {
      const h = harness(1, 1, { classes: [k] });
      h.toBuild();
      const p = h.p(0);
      const max0 = p.maxHp;
      const dmg0 = damageMult(h);
      clearWave(h);
      expect(h.sim.world.wave).toBe(2);
      expect(p.growth).toEqual({ regular: 1, boss: 0 });
      const g = growthOf(k).regular;
      expect(p.maxHp).toBeCloseTo(max0 * (1 + pct(g, 'maxHp')), 6);
      // The new max HP comes in full.
      expect(p.hp).toBe(p.maxHp);
      expect(damageMult(h)).toBeCloseTo(dmg0 + pct(g, 'damage'), 9);
      const healing = p.mods
        .find((m) => m.id === 'growth')!
        .stats!.find((s) => s.stat === 'healing');
      expect(healing?.addPct ?? 0).toBeCloseTo(pct(g, 'healing'), 9);
    });
  }

  it('adds up wave after wave, and gives the bigger boss bump after waves 5 and 10', () => {
    const h = harness(1, 2, { classes: ['warden'] });
    h.toBuild();
    const p = h.p(0);
    const max0 = p.maxHp;
    const events: boolean[] = [];
    const g = growthOf('warden');
    const bossWaves = content.waves.filter((w) => w.boss !== undefined).map((w) => w.n);
    expect(bossWaves.slice(0, 2)).toEqual([5, 10]);
    const steps: number[] = [];
    for (let n = 1; n <= 10; n++) {
      const before = p.maxHp;
      if (h.sim.world.phase !== 'combat') h.toCombat();
      for (const e of h.sim.world.enemies) e.hp = 0;
      h.sim.world.spawns.length = 0;
      for (let i = 0; i < 10 && h.sim.world.phase !== 'build'; i++) {
        h.run(1);
        for (const ev of h.events('growth')) events.push(ev.boss);
      }
      steps.push(p.maxHp - before);
    }
    expect(p.growth).toEqual({ regular: 8, boss: 2 });
    expect(events).toEqual([false, false, false, false, true, false, false, false, false, true]);
    // Additive: base × (1 + 8 × regular + 2 × boss), never compounded.
    expect(p.maxHp).toBeCloseTo(
      max0 * (1 + 8 * pct(g.regular, 'maxHp') + 2 * pct(g.boss, 'maxHp')),
      6,
    );
    // The boss waves (5 and 10) grow more than a regular wave.
    expect(steps[4]).toBeGreaterThan(steps[3]!);
    expect(steps[9]).toBeGreaterThan(steps[8]!);
    expect(steps[4]).toBeCloseTo(max0 * pct(g.boss, 'maxHp'), 6);
  });

  it('never touches a capped stat, even if content lists one', () => {
    const capped: Content = {
      ...content,
      classes: content.classes.map((c) =>
        c.id === 'tank'
          ? {
              ...c,
              growth: {
                regular: [
                  { stat: 'maxHp', addPct: 0.05 },
                  { stat: 'moveSpeed', addPct: 0.2 },
                  { stat: 'range', addPct: 0.2 },
                  { stat: 'damageReduction', add: 0.2 },
                ],
                boss: [],
              },
            }
          : c,
      ),
    };
    const h = harness(1, 1, { classes: ['warden'], content: capped });
    h.toBuild();
    const p = h.p(0);
    const before = { ...p.stats };
    clearWave(h);
    expect(p.growth.regular).toBe(1);
    expect(p.stats.moveSpeed).toBe(before.moveSpeed);
    expect(p.stats.damageReduction).toBe(before.damageReduction);
    expect(p.maxHp).toBeCloseTo(before.maxHp * 1.05, 6);
    const m = p.mods.find((x) => x.id === 'growth')!;
    expect(m.stats!.map((s) => s.stat)).toEqual(['maxHp']);
  });

  it('a knight down at the wave end grows too, and respawns at full HP', () => {
    const h = harness(2, 1, { classes: ['warden', 'ranger'] });
    h.toCombat();
    h.holdSpawns();
    const p = h.p(1);
    p.hp = 0;
    h.run(2);
    expect(p.respawnAt).not.toBeNull();
    clearWave(h);
    expect(p.growth.regular).toBe(1);
    expect(p.respawnAt).toBeNull();
    expect(p.hp).toBe(p.maxHp);
  });
});

describe('the growth header (§10.2)', () => {
  it('names the stats the class grew for the wave just cleared, the boss list after a boss', () => {
    const h = harness(1, 1, { classes: ['artificer'] });
    h.toBuild();
    const p = h.p(0);
    const w = h.sim.world;
    expect(growthFor(content, w, p)).toBeNull(); // none before wave 1
    clearWave(h);
    expect(growthFor(content, w, p)).toEqual({
      wave: 1,
      boss: false,
      stats: ['maxHp', 'damage', 'healing'],
    });
  });
});

describe('tinkerer (§7.2)', () => {
  it('fills the build meter 15% faster, passively and from damage', () => {
    const fill = (tinkerer: boolean) => {
      const h = harness(1, 1, { classes: ['warden'] });
      h.toBuild();
      if (tinkerer) h.give(0, 'tinkerer');
      h.toCombat();
      h.holdSpawns();
      const p = h.p(0);
      p.meter = 0;
      h.run(60 * 5);
      return p.meter;
    };
    expect(fill(true) / fill(false)).toBeCloseTo(1.15, 6);
  });
});
