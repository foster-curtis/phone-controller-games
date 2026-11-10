// Quartermaster card modules (SPEC §6.1): Light Load, Venom Bolts, Overflow, Bulk Buyer, Triage and
// the Plague combo. Strong Arm and Wide Aura are plain stat cards (content/balance.ts). Plague's spread
// lives on the poison effect (cards/effects.ts); its module marks the card on the Quartermaster.
import { dist } from '../geometry';
import { state } from '../internal';
import type { Modifier, ModuleDef, PlayerEnt } from '../types';
import { fieldMedicRadius } from '../modules/fieldMedic';
import { num, stacksOf } from './common';

/** Allies inside the Field Medic aura suffer `factor` less of the carry slowdown (combat, like the aura). */
export const lightLoad: ModuleDef = {
  id: 'light_load',
  make(p) {
    const factor = num(p, 'factor');
    const auraMs = num(p, 'auraMs');
    return {
      id: 'card:light_load',
      hooks: {
        onTick(ctx, self) {
          const s = state(ctx);
          const me = self as PlayerEnt;
          if (s.world.phase !== 'combat' || !s.targetable(me)) return;
          const base = fieldMedicRadius(s.cat.character(me.classId).passive.params);
          const r = s.attackStat(me, base, 'auraRadius');
          for (const q of s.world.players) {
            if (!s.targetable(q) || dist(me.x, me.y, q.x, q.y) > r + q.r) continue;
            ctx.applyEffect(
              q.id,
              { effect: 'aura_field_medic', strength: factor, durationMs: auraMs },
              me.id,
            );
          }
        },
      },
    };
  },
};

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

/** A Bulk Buyer's modifier: every `every`th crate it buys is free (crates.ts asks it). */
export interface BulkBuyerMod extends Modifier {
  bought: number;
  every: number;
}
export const BULK_BUYER_ID = 'card:bulk_buyer';

/**
 * A larger crate discount: every `every`th crate the Quartermaster buys is free (one sooner per extra
 * stack, at least every `minEvery`th). Coins are whole numbers and the 50% discount already sells at the 1-coin
 * floor, so the extra discount comes as free crates (BUILD_PLAN §8).
 */
export const bulkBuyer: ModuleDef = {
  id: 'bulk_buyer',
  make(p) {
    const m: BulkBuyerMod = {
      id: BULK_BUYER_ID,
      bought: 0,
      every: Math.max(num(p, 'minEvery'), num(p, 'every') - (stacksOf(p) - 1)),
    };
    return m;
  },
};

/** The player's Bulk Buyer modifier, if they hold the card (crates.ts counts purchases on it). */
export function bulkBuyerOf(p: { mods: readonly Modifier[] }): BulkBuyerMod | undefined {
  return p.mods.find((x) => x.id === BULK_BUYER_ID) as BulkBuyerMod | undefined;
}

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
