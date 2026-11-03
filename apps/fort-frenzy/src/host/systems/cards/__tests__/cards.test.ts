// Card offers (SPEC §6.1 rules, §15.4 `pickOffer`, §15.9 card picker tests).
import { rngStream } from '@pcg/game-kit';
import { describe, expect, it } from 'vitest';
import { cardEligible, offerRng, pickOffer, type CardLike, type EligibilityCtx } from '../index';

interface Card extends CardLike {
  tier: 'common' | 'rare' | 'combo';
}

const card = (id: string, tier: Card['tier'], extra: Partial<Card> = {}): Card => ({
  id,
  owner: 'engineer',
  tier,
  ...extra,
});

// A class pool shaped like §6.1: shared commons, class commons, rares, a combo.
const pool: Card[] = [
  ...[
    'vitality',
    'might',
    'haste',
    'reach',
    'swiftness',
    'focus',
    'toughness',
    'quick_recovery',
  ].map((id) => card(id, 'common', { owner: 'common' })),
  card('quick_draw', 'common'),
  card('blast_radius', 'common'),
  card('fire_arrows', 'rare'),
  card('piercing_shot', 'rare'),
  card('skyhunter', 'rare', { favoredEnemy: 'flyer' }),
  card('deadeye', 'rare', { unique: true }),
  card('volley', 'rare'),
  card('wildfire', 'combo', { unique: true, requires: ['fire_arrows', 'piercing_shot'] }),
  card('heavy_slam', 'common', { owner: 'warden' }),
];
const isRare = (c: Card) => c.tier !== 'common';

const ctx = (
  owned: Record<string, number> = {},
  extra: Partial<EligibilityCtx> = {},
): EligibilityCtx => ({
  owners: ['engineer', 'common'],
  owned: (id) => owned[id] ?? 0,
  canSpawn: () => true,
  teamHas: () => true,
  ...extra,
});

const ids = (cards: readonly Card[]) => cards.map((c) => c.id);
const eligibleIds = (c: EligibilityCtx) => ids(pool.filter((x) => cardEligible(x, c)));

describe('cardEligible (§6.1 exclusions)', () => {
  it('only the player’s own and common cards', () => {
    expect(eligibleIds(ctx())).not.toContain('heavy_slam');
    expect(eligibleIds(ctx())).toContain('quick_draw');
    expect(eligibleIds(ctx())).toContain('vitality');
  });

  it('excludes unique cards the player already owns; non-unique cards stack', () => {
    const c = ctx({ deadeye: 1, volley: 2 });
    expect(eligibleIds(c)).not.toContain('deadeye');
    expect(eligibleIds(c)).toContain('volley');
  });

  it('excludes combo cards until both prerequisites are owned, then once owned', () => {
    expect(eligibleIds(ctx())).not.toContain('wildfire');
    expect(eligibleIds(ctx({ fire_arrows: 1 }))).not.toContain('wildfire');
    expect(eligibleIds(ctx({ fire_arrows: 1, piercing_shot: 1 }))).toContain('wildfire');
    expect(eligibleIds(ctx({ fire_arrows: 1, piercing_shot: 1, wildfire: 1 }))).not.toContain(
      'wildfire',
    );
  });

  it('combo cards are unique even when not marked', () => {
    const combo = card('x', 'combo', { requires: ['a', 'b'] });
    expect(cardEligible(combo, ctx({ a: 1, b: 1 }))).toBe(true);
    expect(cardEligible(combo, ctx({ a: 1, b: 1, x: 1 }))).toBe(false);
  });

  it('excludes favored-enemy cards whose enemy can’t spawn (Flyers replaced)', () => {
    const c = ctx({}, { canSpawn: (e) => e !== 'flyer' });
    expect(eligibleIds(c)).not.toContain('skyhunter');
    expect(eligibleIds(ctx())).toContain('skyhunter');
  });

  it('excludes cards that depend on a class not on the team', () => {
    const needsWarden = card('shield_wall', 'rare', { requiresClass: 'warden' });
    expect(cardEligible(needsWarden, ctx({}, { teamHas: (k) => k === 'warden' }))).toBe(true);
    expect(cardEligible(needsWarden, ctx({}, { teamHas: () => false }))).toBe(false);
  });
});

describe('pickOffer', () => {
  const offer = (
    seed: number,
    opts: { guaranteedRare?: boolean; owned?: Record<string, number> } = {},
  ) => {
    const c = ctx(opts.owned);
    return pickOffer({
      pool,
      eligible: (x) => cardEligible(x, c),
      isRare,
      rareChance: 0.15,
      guaranteedRare: opts.guaranteedRare ?? false,
      size: 3,
      rng: rngStream(seed, 'cards:1:0'),
    });
  };

  it('offers 3 eligible cards with no duplicates and at most one rare', () => {
    for (let seed = 0; seed < 2000; seed++) {
      const o = offer(seed, { owned: { deadeye: 1 } });
      expect(o).toHaveLength(3);
      expect(new Set(ids(o)).size).toBe(3);
      expect(o.filter(isRare).length).toBeLessThanOrEqual(1);
      expect(ids(o)).not.toContain('deadeye');
      expect(ids(o)).not.toContain('heavy_slam');
      expect(ids(o)).not.toContain('wildfire');
    }
  });

  it('a pool listing a card twice still never offers it twice', () => {
    const doubled = [...pool, ...pool];
    for (let seed = 0; seed < 500; seed++) {
      const o = pickOffer({
        pool: doubled,
        eligible: () => true,
        isRare,
        rareChance: 0.5,
        guaranteedRare: false,
        size: 3,
        rng: rngStream(seed, 'x'),
      });
      expect(new Set(ids(o)).size).toBe(o.length);
    }
  });

  it('after a boss wave every offer has exactly one rare', () => {
    for (let seed = 0; seed < 1000; seed++) {
      expect(offer(seed, { guaranteedRare: true }).filter(isRare)).toHaveLength(1);
    }
  });

  it('about 15% of offers include a rare (10,000 seeded offers, ±1.5%)', () => {
    let rare = 0;
    const n = 10_000;
    for (let seed = 0; seed < n; seed++) {
      const o = pickOffer({
        pool,
        eligible: (x) => cardEligible(x, ctx()),
        isRare,
        rareChance: 0.15,
        guaranteedRare: false,
        size: 3,
        rng: offerRng(seed, 3, seed % 6),
      });
      if (o.some(isRare)) rare++;
    }
    expect(Math.abs(rare / n - 0.15)).toBeLessThanOrEqual(0.015);
  });

  it('same (seed, wave, slot) gives the same offer; another slot or wave usually differs', () => {
    const at = (seed: number, wave: number, slot: number) =>
      ids(
        pickOffer({
          pool,
          eligible: (x) => cardEligible(x, ctx()),
          isRare,
          rareChance: 0.15,
          guaranteedRare: false,
          size: 3,
          rng: offerRng(seed, wave, slot),
        }),
      );
    let differs = 0;
    for (let seed = 0; seed < 50; seed++) {
      expect(at(seed, 4, 2)).toEqual(at(seed, 4, 2));
      if (at(seed, 4, 2).join() !== at(seed, 4, 3).join()) differs++;
      if (at(seed, 4, 2).join() !== at(seed, 5, 2).join()) differs++;
    }
    expect(differs).toBeGreaterThan(80);
  });

  it('shrinks when too few cards are eligible, and fills with one rare when commons run out', () => {
    const tiny = [card('a', 'common'), card('r1', 'rare'), card('r2', 'rare')];
    const o = pickOffer({
      pool: tiny,
      eligible: () => true,
      isRare,
      rareChance: 0,
      guaranteedRare: false,
      size: 3,
      rng: rngStream(1, 'x'),
    });
    expect(o).toHaveLength(2);
    expect(o.filter(isRare)).toHaveLength(1);
    expect(
      pickOffer({
        pool: [],
        eligible: () => true,
        isRare,
        rareChance: 1,
        guaranteedRare: true,
        size: 3,
        rng: rngStream(1, 'x'),
      }),
    ).toEqual([]);
  });
});
