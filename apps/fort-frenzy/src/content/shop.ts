// Team shop items (SPEC §3.4, §3.5, §6.2): crates at the depot price, rising repair, the 3 sentry
// upgrades, squad stats after regular waves, structure tiers, Charged walls (the `spiked_walls` item)
// and the Quartermaster-only base armor and emergency kit. Prices rise with each tier; building
// upgrades apply to every structure of that type, including ones built later. Items are shown only
// when the team can use them (`visibleIf`). Every number is a starting value (§14 #2).
import type { ShopItemDef } from './types';

/** Items at or above this price ask for a press-and-hold to confirm (§6.2, ~0.6 s). */
export const HOLD_CONFIRM_PRICE = 10;

const ENGINEER = { teamHasAny: ['engineer' as const] };
const WARDEN = { teamHasAny: ['warden' as const] };

export const crate = {
  id: 'crate',
  tiers: [{ price: 2, effect: { kind: 'crates', count: 1 } }],
  repeatable: true,
} satisfies ShopItemDef;

/** Repeatable; the price climbs this ladder per purchase and stays at the last step (§3.4). */
export const repair = {
  id: 'repair',
  tiers: [4, 6, 8, 10, 12, 14].map((price) => ({
    price,
    effect: { kind: 'repair' as const, hp: 150 },
  })),
  repeatable: true,
} satisfies ShopItemDef;

export const archerDamage = {
  id: 'archer_damage',
  tiers: [
    {
      price: 8,
      effect: { kind: 'stats', target: 'archers', stats: [{ stat: 'damage', addPct: 0.5 }] },
    },
  ],
} satisfies ShopItemDef;

export const archerRange = {
  id: 'archer_range',
  tiers: [
    {
      price: 8,
      effect: { kind: 'stats', target: 'archers', stats: [{ stat: 'range', addPct: 0.25 }] },
    },
  ],
} satisfies ShopItemDef;

export const archerThird = {
  id: 'archer_third',
  tiers: [{ price: 12, effect: { kind: 'archers', add: 1 } }],
} satisfies ShopItemDef;

/**
 * Squad stats (§6.2, §8): one tier per regular (non-boss) wave cleared, sold only in the build phase
 * after a regular wave; squad size grows after the boss waves instead.
 */
export const squadStats = {
  id: 'squad_stats',
  tiers: Array.from({ length: 12 }, (_, i) => ({
    price: 5 + i,
    effect: {
      kind: 'stats' as const,
      target: 'squad' as const,
      stats: [
        { stat: 'maxHp' as const, addPct: 0.1 },
        { stat: 'damage' as const, addPct: 0.1 },
      ],
    },
  })),
  visibleIf: { teamHasAny: ['commander'] },
  afterRegularWaveOnly: true,
} satisfies ShopItemDef;

const tiers3 = (prices: [number, number, number], effect: ShopItemDef['tiers'][number]['effect']) =>
  prices.map((price) => ({ price, effect }));

export const arrowRate = {
  id: 'arrow_rate',
  tiers: tiers3([6, 10, 14], {
    kind: 'stats',
    target: 'arrow_tower',
    stats: [{ stat: 'attackSpeed', addPct: 0.2 }],
  }),
  visibleIf: ENGINEER,
} satisfies ShopItemDef;

export const bombRadius = {
  id: 'bomb_radius',
  tiers: tiers3([6, 10, 14], {
    kind: 'stats',
    target: 'bomb_tower',
    stats: [{ stat: 'radius', addPct: 0.15 }],
  }),
  visibleIf: ENGINEER,
} satisfies ShopItemDef;

export const towerHp = {
  id: 'tower_hp',
  tiers: tiers3([5, 8, 12], {
    kind: 'stats',
    target: 'towers',
    stats: [{ stat: 'maxHp', addPct: 0.25 }],
  }),
  visibleIf: ENGINEER,
} satisfies ShopItemDef;

export const wallHp = {
  id: 'wall_hp',
  tiers: tiers3([4, 7, 10], {
    kind: 'stats',
    target: 'wall',
    stats: [{ stat: 'maxHp', addPct: 0.3 }],
  }),
  visibleIf: WARDEN,
} satisfies ShopItemDef;

/** More discharges per net (§7.1), existing nets included. */
export const snareCharges = {
  id: 'snare_charges',
  tiers: tiers3([4, 7, 10], { kind: 'discharges', add: 2 }),
  visibleIf: WARDEN,
} satisfies ShopItemDef;

/** Charged walls (neon knights' name, §7.2): enemies that attack a wall take `damage` per hit. */
export const spikedWalls = {
  id: 'spiked_walls',
  tiers: [
    {
      price: 10,
      effect: {
        kind: 'module',
        target: 'wall',
        module: { module: 'charged_walls', params: { damage: 10 } },
      },
    },
  ],
  visibleIf: WARDEN,
} satisfies ShopItemDef;

/** Quartermaster-only (§6.2): the Citadel takes less damage (capped with every damage reduction). */
export const baseArmor = {
  id: 'base_armor',
  tiers: tiers3([8, 12, 16], {
    kind: 'stats',
    target: 'base',
    stats: [{ stat: 'damageReduction', add: 0.1 }],
  }),
  visibleIf: { teamHasAny: ['quartermaster'] },
  qmOnly: true,
} satisfies ShopItemDef;

/** Quartermaster-only (§3.4): held one at a time, used with the action button in the repair zone. */
export const emergencyKit = {
  id: 'emergency_kit',
  tiers: [{ price: 6, effect: { kind: 'kit' } }],
  visibleIf: { teamHasAny: ['quartermaster'] },
  qmOnly: true,
  repeatable: true,
} satisfies ShopItemDef;

export const shop: ShopItemDef[] = [
  crate,
  repair,
  archerDamage,
  archerRange,
  archerThird,
  squadStats,
  arrowRate,
  bombRadius,
  towerHp,
  wallHp,
  snareCharges,
  spikedWalls,
  baseArmor,
  emergencyKit,
];
