// The hot side in the run (SPEC §9.3, §9.4; RD3): each wave's schedule from content (waves 1–3 one
// side, 4 and 6–8 one shift, 9 and 11 two, 5 and 10 the boss's side, 12–15 per spawn pulse), the hot
// share, the `players + 1` active-portal cap per pulse with a hot-side portal in each, and the portal
// flare 1 s (60 steps) before every spawn.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { enemies, rules, waves } from '../../../content/balance';
import { PORTAL_IDS, type PortalId } from '../../../shared/ids';
import type { PendingSpawn } from '../types';
import { harness } from './harness';

const side = (p: PortalId) => content.map!.portals[p].side;
const cost = (id: string) => enemies.find((e) => e.id === id)!.budget;

/** Wave `n`'s pending spawns at its combat start, with `players` players. */
function plan(n: number, players: number, seed: number): PendingSpawn[] {
  const h = harness(players, seed);
  h.toBuild();
  if (n !== 1) {
    h.sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: n });
    h.run(1);
  }
  h.toCombat();
  return h.sim.world.spawns.map((s) => ({ ...s }));
}

/** The pulses (groups sharing a tick), boss left out, in time order. */
function pulses(spawns: PendingSpawn[]): PendingSpawn[][] {
  const out = new Map<number, PendingSpawn[]>();
  for (const s of spawns) {
    if (s.enemy === 'colossus') continue;
    out.set(s.atTick, [...(out.get(s.atTick) ?? []), s]);
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
}

function changes(ps: PendingSpawn[][]): number {
  let n = 0;
  for (let i = 1; i < ps.length; i++) if (ps[i]![0]!.hot !== ps[i - 1]![0]!.hot) n++;
  return n;
}

const SEEDS = [1, 2, 3];

describe('hot-side schedule (§9.4)', () => {
  it('content: 1–3 hold, 4 and 6–8 one shift, 9 and 11 two, 5 and 10 hold, 12–15 per group', () => {
    const hot = (n: number) => waves.find((w) => w.n === n)!.hot;
    for (const n of [1, 2, 3, 5, 10]) expect(hot(n)).toEqual({ mode: 'wave', shifts: 0 });
    for (const n of [4, 6, 7, 8]) expect(hot(n)).toEqual({ mode: 'wave', shifts: 1 });
    for (const n of [9, 11]) expect(hot(n)).toEqual({ mode: 'wave', shifts: 2 });
    for (const n of [12, 13, 14, 15]) expect(hot(n)).toEqual({ mode: 'group' });
  });

  for (const n of [1, 2, 3, 4, 6, 7, 8, 9, 11]) {
    it(`wave ${n}: the hot side shifts exactly as scheduled, each time to another side`, () => {
      const def = waves.find((w) => w.n === n)!;
      const shifts = def.hot.mode === 'wave' ? def.hot.shifts : 0;
      for (const seed of SEEDS) {
        const ps = pulses(plan(n, 2, seed));
        expect(changes(ps)).toBe(shifts);
      }
    });
  }

  for (const n of [5, 10]) {
    it(`wave ${n}: the boss spawns on the hot side, which holds all wave`, () => {
      for (const seed of SEEDS) {
        const all = plan(n, 2, seed);
        const boss = all.find((s) => s.enemy === 'colossus')!;
        expect(side(boss.portal)).toBe(boss.hot);
        for (const s of all) expect(s.hot).toBe(boss.hot);
      }
    });
  }

  for (const n of [12, 13, 14, 15]) {
    it(`wave ${n}: each spawn pulse rolls its own hot side, never twice in a row`, () => {
      for (const seed of SEEDS) {
        const ps = pulses(plan(n, 3, seed));
        expect(ps.length).toBeGreaterThan(3);
        for (let i = 1; i < ps.length; i++) expect(ps[i]![0]!.hot).not.toBe(ps[i - 1]![0]!.hot);
      }
    });
  }

  it('wave 15: the boss on the hot side of the first pulse', () => {
    for (const seed of SEEDS) {
      const all = plan(15, 2, seed);
      const boss = all.find((s) => s.enemy === 'colossus')!;
      expect(side(boss.portal)).toBe(boss.hot);
      expect(boss.hot).toBe(pulses(all)[0]![0]!.hot);
    }
  });

  it('the hot side gets at least half of the budget, within the content share ± 0.10', () => {
    for (const n of [1, 4, 9, 12]) {
      for (const players of [1, 2, 4, 6]) {
        const spawns = plan(n, players, 5).filter((s) => s.enemy !== 'colossus');
        let hot = 0;
        let all = 0;
        for (const s of spawns) {
          all += cost(s.enemy);
          if (side(s.portal) === s.hot) hot += cost(s.enemy);
        }
        expect(hot / all).toBeGreaterThanOrEqual(0.5);
        expect(Math.abs(hot / all - rules.hot.share)).toBeLessThanOrEqual(0.1);
      }
    }
  });
});

describe('active-portal cap (§9.3)', () => {
  for (const players of [1, 2, 3, 4, 5, 6]) {
    it(`${players} player(s): at most ${Math.min(players + 1, 6)} portals a pulse, each with a hot-side portal`, () => {
      const cap = Math.min(players + 1, 6);
      for (const n of [1, 6, 9, 13]) {
        const ps = pulses(plan(n, players, 4));
        for (const p of ps) {
          expect(new Set(p.map((s) => s.portal)).size).toBeLessThanOrEqual(cap);
          expect(p.some((s) => side(s.portal) === s.hot)).toBe(true);
        }
      }
    });
  }

  it('solo uses 2 portals a pulse; 5 or 6 players see all 6 portals', () => {
    const solo = pulses(plan(9, 1, 2));
    expect(Math.max(...solo.map((p) => new Set(p.map((s) => s.portal)).size))).toBe(2);
    for (const players of [5, 6]) {
      const used = new Set(plan(9, players, 2).map((s) => s.portal));
      expect(used.size).toBe(PORTAL_IDS.length);
    }
  });
});

describe('portal flare (§9.4)', () => {
  it('every spawn follows its portal’s flare by flareMs (60 steps)', () => {
    expect(rules.flareMs).toBe(1000);
    const h = harness(3, 2);
    h.toCombat();
    h.sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
    const flares: string[] = [];
    let spawns = 0;
    for (let i = 0; i < 60 * 30 && h.sim.world.phase === 'combat'; i++) {
      h.sim.step();
      const t = h.sim.world.tick - 1;
      for (const e of h.events('portalFlare')) flares.push(`${e.portal}@${t}`);
      for (const e of h.events('spawn')) {
        spawns++;
        expect(flares).toContain(`${e.portal}@${t - 60}`);
      }
    }
    expect(spawns).toBeGreaterThan(5);
  });
});
