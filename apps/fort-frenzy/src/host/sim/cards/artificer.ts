// Artificer card modules (SPEC §6.1): Venom Bolts, Overflow, Triage and the Plague combo. Wide Aura
// is a plain stat card (content/balance.ts). Plague's spread lives on the poison effect
// (cards/effects.ts); its module marks the card on the Artificer.
import { state } from '../internal';
import type { ModuleDef } from '../types';
import { num, stacksOf } from './common';

/** Main bolts apply poison: `tick` damage per second (×stacks) for `durationMs`. */
export const venomBolts: ModuleDef = {
  id: 'venom_bolts',
  make(p) {
    const strength = num(p, 'tick') * stacksOf(p);
    const durationMs = num(p, 'durationMs');
    return {
      id: 'card:venom_bolts',
      hooks: {
        onAttack(_ctx, _self, atk) {
          if (atk.slot === 'main') atk.effects.push({ effect: 'poison', strength, durationMs });
        },
      },
    };
  },
};

/**
 * Healing beyond a player's full HP becomes a temporary shield on them (up to `cap` HP, `durationMs`
 * after the last top-up). The damage pipeline's shield stage spends it (state.ts).
 */
export const overflow: ModuleDef = {
  id: 'overflow',
  make(p) {
    const cap = num(p, 'cap');
    const durationMs = num(p, 'durationMs');
    return {
      id: 'card:overflow',
      hooks: {
        onHeal(ctx, self, h) {
          if (h.overflow <= 0) return;
          const s = state(ctx);
          if (s.kinds.get(h.target) !== 'player') return;
          const u = s.units.get(h.target);
          if (!u || u.hp <= 0) return;
          const fx = u.effects.find((x) => x.def === 'shield');
          if (fx) {
            fx.strength = Math.min(cap, fx.strength + h.overflow);
            fx.remaining = Math.max(fx.remaining, s.cat.steps(durationMs));
          } else {
            ctx.applyEffect(
              u.id,
              { effect: 'shield', strength: Math.min(cap, h.overflow), durationMs },
              self.id,
            );
          }
        },
      },
    };
  },
};

/** Heals on players below `below` of their max HP are multiplied by `mult`. */
export const triage: ModuleDef = {
  id: 'triage',
  make(p) {
    const below = num(p, 'below');
    const mult = num(p, 'mult');
    return {
      id: 'card:triage',
      hooks: {
        modifyHeal(ctx, _self, h) {
          const s = state(ctx);
          if (s.kinds.get(h.target) !== 'player') return;
          const u = s.units.get(h.target);
          if (u && u.maxHp > 0 && u.hp / u.maxHp < below) h.amount *= mult;
        },
      },
    };
  },
};

/** Marks Plague: poisoned enemies that die spread poison (the poison effect checks the card). */
export const plague: ModuleDef = {
  id: 'plague',
  make: () => ({ id: 'card:plague' }),
};
