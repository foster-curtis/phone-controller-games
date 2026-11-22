// Delayed regen (SPEC §5; RD3): after 4 s without damage a knight heals 8% of max HP every 1 s, in
// ticks, until full or hit again; in the build phase too; not a heal (no event, charge or stats).
import { describe, expect, it } from 'vitest';
import { rules } from '../../../content/balance';
import { harness, type Harness } from './harness';

const steps = (ms: number) => Math.max(1, Math.round((ms * 60) / 1000));
const DELAY = steps(rules.regen.delayMs);
const EVERY = steps(rules.regen.everyMs);

/** A Grunt beside the knight until it lands one hit; returns the tick of the hit (then it's gone). */
function hitOnce(h: Harness): number {
  const p = h.p(0);
  const g = h.sim.spawnEnemy('grunt', p.x, p.y + 0.7);
  for (let i = 0; i < 300; i++) {
    h.sim.step();
    if (h.events('damage').some((d) => d.target === p.id && d.amount > 0)) {
      g.hp = 0;
      h.sim.step();
      return h.sim.world.tick - 2;
    }
  }
  throw new Error('no hit');
}

/** Ticks at which the knight's HP rose, over `n` steps. */
function rises(h: Harness, n: number): { at: number; by: number }[] {
  const out: { at: number; by: number }[] = [];
  for (let i = 0; i < n; i++) {
    const before = h.p(0).hp;
    h.sim.step();
    if (h.p(0).hp > before) out.push({ at: h.sim.world.tick - 1, by: h.p(0).hp - before });
  }
  return out;
}

function hurtWarden() {
  const h = harness(1, 1, { classes: ['warden'] });
  h.toCombat();
  h.holdSpawns();
  h.put(0, 12, 14);
  h.p(0).hp = h.p(0).maxHp * 0.5;
  return h;
}

describe('delayed regen (§5)', () => {
  it('starts 4 s after the last hit and heals 8% of max HP per 1 s tick, no heal event', () => {
    const h = hurtWarden();
    const hit = hitOnce(h);
    const max = h.p(0).maxHp;
    const heals: number[] = [];
    const got: { at: number; by: number }[] = [];
    for (let i = 0; i < DELAY + 3 * EVERY; i++) {
      const before = h.p(0).hp;
      h.sim.step();
      heals.push(...h.events('heal').map(() => 1));
      if (h.p(0).hp > before) got.push({ at: h.sim.world.tick - 1, by: h.p(0).hp - before });
    }
    expect(got.slice(0, 3).map((x) => x.at - hit)).toEqual([
      DELAY,
      DELAY + EVERY,
      DELAY + 2 * EVERY,
    ]);
    for (const x of got) expect(x.by).toBeCloseTo(max * rules.regen.pct, 9);
    expect(heals).toEqual([]);
    expect(h.p(0).run.healingDone).toBe(0);
  });

  it('damage interrupts it: the next tick waits another 4 s', () => {
    const h = hurtWarden();
    hitOnce(h);
    const first = rises(h, DELAY + 2);
    expect(first.length).toBeGreaterThan(0);
    const hit = hitOnce(h);
    const next = rises(h, DELAY + 2);
    expect(next.map((x) => x.at - hit)).toEqual([DELAY]);
  });

  it('stops at full HP', () => {
    const h = hurtWarden();
    h.p(0).hp = h.p(0).maxHp - 1;
    h.run(EVERY * 3);
    expect(h.p(0).hp).toBe(h.p(0).maxHp);
  });

  it('runs in the build phase too', () => {
    const h = harness(1, 1, { classes: ['warden'] });
    h.toBuild();
    h.p(0).hp = 20;
    const got = rises(h, EVERY * 2 + 1);
    expect(got).toHaveLength(3);
  });

  it('a dazed knight does not regen', () => {
    const h = hurtWarden();
    h.sim.command({ c: 'presence', slot: 0, connected: false });
    const hp = h.p(0).hp;
    h.run(EVERY * 3);
    expect(h.p(0).hp).toBe(hp);
  });
});
