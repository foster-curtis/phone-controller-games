// Upgrade cards (SPEC §6.1): the 8 shared commons (numbers tuned per class, `perClass`), then each
// class's 2 commons, 5 rares and 1 combo, in the spec's table order. Stat cards change stats (attack
// stats scoped to their button, so aim previews read the effective values); the rest are sim
// modules (src/host/sim/cards/). Every number is a starting value for playtesting (§14 #2).
// Stacks add (×N); range, movement speed and damage reduction are capped by the rules (+40%).
import type { CardDef, StatMod } from './types';

const per = (
  stat: StatMod['stat'],
  key: 'addPct' | 'add',
  engineer: number,
  warden: number,
  quartermaster: number,
  commander: number,
): CardDef['perClass'] => {
  const mod = (v: number): StatMod[] => [key === 'add' ? { stat, add: v } : { stat, addPct: v }];
  return {
    engineer: mod(engineer),
    warden: mod(warden),
    quartermaster: mod(quartermaster),
    commander: mod(commander),
  };
};

// ---- shared commons -----------------------------------------------------------------------------

export const commonCards: CardDef[] = [
  {
    id: 'vitality',
    owner: 'common',
    tier: 'common',
    perClass: per('maxHp', 'addPct', 0.12, 0.1, 0.12, 0.1),
  },
  {
    id: 'might',
    owner: 'common',
    tier: 'common',
    perClass: per('damage', 'addPct', 0.1, 0.1, 0.12, 0.1),
  },
  {
    id: 'haste',
    owner: 'common',
    tier: 'common',
    perClass: per('attackSpeed', 'addPct', 0.1, 0.1, 0.1, 0.12),
  },
  {
    id: 'reach',
    owner: 'common',
    tier: 'common',
    perClass: per('range', 'addPct', 0.08, 0.1, 0.1, 0.12),
  },
  {
    id: 'swiftness',
    owner: 'common',
    tier: 'common',
    perClass: per('moveSpeed', 'addPct', 0.08, 0.1, 0.08, 0.08),
  },
  {
    id: 'focus',
    owner: 'common',
    tier: 'common',
    perClass: per('superCharge', 'addPct', 0.12, 0.12, 0.15, 0.12),
  },
  {
    id: 'toughness',
    owner: 'common',
    tier: 'common',
    perClass: per('damageReduction', 'add', 0.06, 0.08, 0.06, 0.07),
  },
  // −2 s respawn, never below 5 s (the rules cap Σ add at −5000 ms on a 10 s respawn).
  {
    id: 'quick_recovery',
    owner: 'common',
    tier: 'common',
    perClass: per('respawnMs', 'add', -2000, -2000, -2000, -2000),
  },
];

// ---- engineer -----------------------------------------------------------------------------------

export const engineerCards: CardDef[] = [
  {
    id: 'quick_draw',
    owner: 'engineer',
    tier: 'common',
    stats: [{ stat: 'projectileSpeed', addPct: 0.25, scope: 'main' }],
  },
  {
    id: 'blast_radius',
    owner: 'engineer',
    tier: 'common',
    stats: [{ stat: 'radius', addPct: 0.2, scope: 'super' }],
  },
  {
    id: 'fire_arrows',
    owner: 'engineer',
    tier: 'rare',
    module: { module: 'fire_arrows', params: { tick: 3, durationMs: 3000 } },
  },
  {
    id: 'piercing_shot',
    owner: 'engineer',
    tier: 'rare',
    module: { module: 'piercing_shot', params: { pierce: 1 } },
  },
  {
    id: 'skyhunter',
    owner: 'engineer',
    tier: 'rare',
    favoredEnemy: 'flyer',
    module: { module: 'skyhunter', params: { enemies: 'flyer', pct: 0.5 } },
  },
  // Steady Aim's activation time is its passive's duration (600 ms → 360 ms).
  {
    id: 'deadeye',
    owner: 'engineer',
    tier: 'rare',
    stats: [{ stat: 'durationMs', addPct: -0.4, scope: 'passive' }],
  },
  {
    id: 'volley',
    owner: 'engineer',
    tier: 'rare',
    module: { module: 'volley', params: { every: 4, arrows: 3, spreadDeg: 14 } },
  },
  {
    id: 'wildfire',
    owner: 'engineer',
    tier: 'combo',
    requires: ['fire_arrows', 'piercing_shot'],
    module: { module: 'wildfire' },
  },
];

// ---- warden -------------------------------------------------------------------------------------

export const wardenCards: CardDef[] = [
  {
    id: 'heavy_slam',
    owner: 'warden',
    tier: 'common',
    stats: [{ stat: 'arcDeg', addPct: 0.2, scope: 'main' }],
  },
  // Longer stomp stun (the stun's duration × `stunMs`); no extra stagger on the boss (FF11).
  {
    id: 'earthshaker',
    owner: 'warden',
    tier: 'common',
    stats: [{ stat: 'stunMs', addPct: 0.3, scope: 'super' }],
  },
  {
    id: 'aftershock',
    owner: 'warden',
    tier: 'rare',
    module: {
      module: 'aftershock',
      params: { radius: 1.2, slow: 0.35, slowMs: 800, zoneMs: 2000 },
    },
  },
  {
    id: 'giant_slayer',
    owner: 'warden',
    tier: 'rare',
    favoredEnemy: 'brute',
    module: { module: 'giant_slayer', params: { enemies: 'brute,colossus', pct: 0.5 } },
  },
  {
    id: 'master_mason',
    owner: 'warden',
    tier: 'rare',
    stats: [
      { stat: 'repairRate', addPct: 0.5, scope: 'passive' },
      { stat: 'auraRadius', addPct: 0.3, scope: 'passive' },
    ],
  },
  {
    id: 'bodyguard',
    owner: 'warden',
    tier: 'rare',
    module: { module: 'bodyguard', params: { radius: 3, reduction: 0.2 } },
  },
  {
    id: 'unshakable',
    owner: 'warden',
    tier: 'rare',
    unique: true,
    module: { module: 'unshakable' },
  },
  {
    id: 'fault_line',
    owner: 'warden',
    tier: 'combo',
    requires: ['aftershock', 'master_mason'],
    module: { module: 'fault_line', params: { slow: 0.4, slowMs: 1500 } },
  },
];

// ---- quartermaster ------------------------------------------------------------------------------

export const quartermasterCards: CardDef[] = [
  {
    id: 'light_load',
    owner: 'quartermaster',
    tier: 'common',
    unique: true,
    module: { module: 'light_load', params: { factor: 0.5 } },
  },
  {
    id: 'strong_arm',
    owner: 'quartermaster',
    tier: 'common',
    stats: [
      { stat: 'throwRange', addPct: 0.3 },
      { stat: 'throwSpeed', addPct: 0.3 },
    ],
  },
  {
    id: 'venom_bolts',
    owner: 'quartermaster',
    tier: 'rare',
    module: { module: 'venom_bolts', params: { tick: 2, durationMs: 4000 } },
  },
  {
    id: 'overflow',
    owner: 'quartermaster',
    tier: 'rare',
    unique: true,
    module: { module: 'overflow', params: { cap: 40, durationMs: 6000 } },
  },
  {
    id: 'bulk_buyer',
    owner: 'quartermaster',
    tier: 'rare',
    module: { module: 'bulk_buyer', params: { every: 3 } },
  },
  {
    id: 'wide_aura',
    owner: 'quartermaster',
    tier: 'rare',
    stats: [{ stat: 'auraRadius', addPct: 0.3 }],
  },
  {
    id: 'triage',
    owner: 'quartermaster',
    tier: 'rare',
    unique: true,
    module: { module: 'triage', params: { below: 0.3, mult: 2 } },
  },
  {
    id: 'plague',
    owner: 'quartermaster',
    tier: 'combo',
    requires: ['venom_bolts', 'wide_aura'],
    module: { module: 'plague' },
  },
];

// ---- commander ----------------------------------------------------------------------------------

export const commanderCards: CardDef[] = [
  {
    id: 'bladework',
    owner: 'commander',
    tier: 'common',
    stats: [{ stat: 'arcDeg', addPct: 0.2, scope: 'main' }],
  },
  {
    id: 'forced_march',
    owner: 'commander',
    tier: 'common',
    module: { module: 'forced_march', params: { pct: 0.2 } },
  },
  // Longer morale (the super's effect durations × `durationMs`).
  {
    id: 'rally_cry',
    owner: 'commander',
    tier: 'rare',
    stats: [{ stat: 'durationMs', addPct: 0.3, scope: 'super' }],
  },
  {
    id: 'siege_breakers',
    owner: 'commander',
    tier: 'rare',
    favoredEnemy: 'siege',
    module: { module: 'siege_breakers', params: { pct: 0.5 } },
  },
  {
    id: 'veterans',
    owner: 'commander',
    tier: 'rare',
    module: { module: 'veterans', params: { gain: 0.1, max: 5 } },
  },
  {
    id: 'last_stand',
    owner: 'commander',
    tier: 'rare',
    module: { module: 'last_stand', params: { pct: 0.15 } },
  },
  {
    id: 'vanguard',
    owner: 'commander',
    tier: 'rare',
    module: { module: 'vanguard', params: { radius: 3, reduction: 0.2 } },
  },
  {
    id: 'warcry',
    owner: 'commander',
    tier: 'combo',
    requires: ['rally_cry', 'vanguard'],
    module: { module: 'warcry', params: { radius: 4, strength: 0.2, durationMs: 4000 } },
  },
];

export const cards: CardDef[] = [
  ...commonCards,
  ...engineerCards,
  ...wardenCards,
  ...quartermasterCards,
  ...commanderCards,
];
