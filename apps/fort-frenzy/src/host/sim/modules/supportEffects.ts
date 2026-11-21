// Status effects of the support knights and the redesign (SPEC §8, §15.3): morale (attack speed and
// damage), haste (movement) and the Lead from the Front aura (damage) until RD9; slow; the shield
// generator's `guard` and Challenger's `taunt` (markers until RD3 and RD7 give them their rules).
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

export const leadAura: EffectDef = {
  id: 'aura_lead_from_the_front',
  stacking: 'refresh',
  modifier: (k) => ({
    id: 'effect:aura_lead_from_the_front',
    stats: [{ stat: 'damage', addPct: k }],
  }),
};

export const slowEffect: EffectDef = {
  id: 'slow',
  stacking: 'strongest',
  modifier: (strength) => ({
    id: 'effect:slow',
    stats: [{ stat: 'moveSpeed', addPct: -Math.min(1, Math.max(0, strength)) }],
  }),
};

/** The shield generator's damage reduction (§7.4): the strongest wins; RD3 applies it after the cap. */
export const guardEffect: EffectDef = {
  id: 'guard',
  stacking: 'strongest',
  modifier: () => ({ id: 'effect:guard' }),
};

/** Challenger (§6.1): enemies in aggro range pick this knight first (RD7). */
export const tauntEffect: EffectDef = {
  id: 'taunt',
  stacking: 'refresh',
  modifier: () => ({ id: 'effect:taunt' }),
};
