// The coin curve (SPEC §6, §6.2; RD11, RD11-fix-1): an autopilot run with a team that saves
// (sim/economy.ts) at Normal, for 1, 2, 4 and 6 players. The player-count table's coin factor puts
// every team size near the 2-player curve: nothing is affordable in the first build phases, repair
// becomes affordable after wave 2, and the team buys about 10 items over the 15 waves. The numbers are
// logged; `pnpm --filter @pcg/fort-frenzy exec tsx scripts/economy.ts` prints 1, 2, 3, 4 and 6 players.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { ECONOMY_TEAMS, economyLines, economyRun } from '../economy';
import { harness } from './harness';

const price = (id: string, tier = 0) => content.shop.find((s) => s.id === id)!.tiers[tier]!.price;

describe('economy (Normal)', () => {
  for (const players of [1, 2, 4, 6]) {
    const classes = ECONOMY_TEAMS[players]!;
    it(`${players} player(s): about 10 items over 15 waves, nothing before wave 2, repair after wave 2`, () => {
      const r = economyRun({ seed: 1, classes });
      console.log(
        `economy (seed 1, ${classes.join('+')}): ${r.purchases} purchases, ${r.result}\n  ${economyLines(r).join('\n  ')}`,
      );
      expect(r.result).toBe('victory');
      const at = (wave: number) => r.waves.find((x) => x.wave === wave)!;
      // The build phases before waves 1 and 2: nothing bought, and nothing in the shop affordable.
      const cheapest = Math.min(...content.shop.map((s) => s.tiers[0]!.price));
      expect(cheapest).toBe(price('repair'));
      for (const n of [1, 2]) {
        expect(at(n).bought, `wave ${n}`).toEqual([]);
        expect(at(n).coins, `wave ${n}`).toBeLessThan(cheapest);
      }
      // After wave 2's kills, repair (the cheapest) is affordable.
      expect(at(3).coins).toBeGreaterThanOrEqual(price('repair'));
      // A sentry upgrade or a tier I around waves 3–4 (by the build phase before wave 5).
      const tierOne = Math.min(price('archer_damage'), price('archer_range'), price('base_hp'));
      expect(Math.max(at(4).coins, at(5).coins)).toBeGreaterThanOrEqual(tierOne);
      // About 10 purchases a run.
      expect(r.purchases).toBeGreaterThanOrEqual(8);
      expect(r.purchases).toBeLessThanOrEqual(12);
    }, 120_000);
  }
});

describe('coin factor by player count (§9.4; RD11-fix-1)', () => {
  it('2 players = 1, and fewer players earn strictly more a kill', () => {
    const coins = content.scaling.map((r) => r.coins);
    expect(content.scaling.find((r) => r.players === 2)!.coins).toBe(1);
    for (let i = 1; i < coins.length; i++) expect(coins[i]!).toBeLessThan(coins[i - 1]!);
  });

  /** Team coins one Grunt kill pays, with `players` connected at the wave start. */
  const gruntPay = (players: number): number => {
    const h = harness(players, 3);
    h.toCombat();
    h.holdSpawns();
    const w = h.sim.world;
    h.sim.command({ c: 'debug', slot: -1, action: 'spawn', enemy: 'grunt', portal: 'right-s' });
    h.run(1);
    expect(w.enemies).toHaveLength(1);
    const before = w.team.coins;
    w.enemies[0]!.hp = 0;
    h.run(1);
    return w.team.coins - before;
  };

  it('coinsFor pays more per enemy for 1 player than 2, 2 than 4, 4 than 6', () => {
    const pay = [1, 2, 4, 6].map(gruntPay);
    console.log(`grunt pay by players 1/2/4/6: ${pay.map((x) => x.toFixed(3)).join(' / ')}`);
    expect(pay[1]).toBeCloseTo(content.enemies.find((e) => e.id === 'grunt')!.budget * 0.25);
    for (let i = 1; i < pay.length; i++) expect(pay[i]!).toBeLessThan(pay[i - 1]!);
  });
});
