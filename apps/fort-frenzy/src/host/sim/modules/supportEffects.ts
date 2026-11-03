// Status effects of the support classes (SPEC §8, §15.3): morale (attack speed and damage), haste
// (movement), the tower defense bonus (damage reduction) and the Lead from the Front aura (damage).
// Strength is the fraction added (+30% = 0.3).
import type { EffectDef } from '../types';

export const morale: EffectDef = {
  id: 'morale',
  stacking: 'refresh',
  modifier: (k) => ({
    id: 'effect:morale',
    stats: [
      { stat: 'damage', addPct: k },
      { stat: 'attackSpeed', addPct: k },
    ],
  }),
};

export const haste: EffectDef = {
  id: 'haste',
  stacking: 'refresh',
  modifier: (k) => ({ id: 'effect:haste', stats: [{ stat: 'moveSpeed', addPct: k }] }),
};

export const towerDefense: EffectDef = {
  id: 'tower_defense',
  stacking: 'strongest',
  modifier: (k) => ({ id: 'effect:tower_defense', stats: [{ stat: 'damageReduction', add: k }] }),
};

export const leadAura: EffectDef = {
  id: 'aura_lead_from_the_front',
  stacking: 'refresh',
  modifier: (k) => ({
    id: 'effect:aura_lead_from_the_front',
    stats: [{ stat: 'damage', addPct: k }],
  }),
};
