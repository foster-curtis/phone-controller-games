// The coin curve (SPEC §6, §6.2; RD11): an autopilot run with a team that saves (sim/economy.ts),
// 2 players at Normal (the wave budgets' reference). Nothing is affordable in the first build phases,
// repair becomes affordable after wave 2, and the team buys about 10 items over the 15 waves. The
// numbers are logged; `pnpm --filter @pcg/fort-frenzy exec tsx scripts/economy.ts` prints 1, 2 and 4
// players.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { economyLines, economyRun } from '../economy';

const price = (id: string, tier = 0) => content.shop.find((s) => s.id === id)!.tiers[tier]!.price;

describe('economy (2 players, Normal)', () => {
  it('buys about 10 items over 15 waves, nothing before wave 2, repair after wave 2', () => {
    const r = economyRun({ seed: 1, classes: ['ranger', 'artificer'] });
    console.log(
      `economy (seed 1, ranger+artificer): ${r.purchases} purchases, ${r.result}\n  ${economyLines(r).join('\n  ')}`,
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
});
