// Card status effects (SPEC §6.1, §15.3): burn and poison (damage over time, stacking), the Overflow
// shield, and the card auras (Bodyguard, Vanguard, Light Load), all on the one timed-effect system.
// Burn and poison carry the combo death hooks (§15.3 "on the effect"): a burning enemy that dies
// ignites its neighbors when the burn's source owns Wildfire, a poisoned one spreads poison when the
// source owns Plague. Leaf module: types, internal and geometry only (never the registry).
import { dist } from '../geometry';
import { state } from '../internal';
import type { EffectDef, PlayerEnt, SimCtx, StatusEffect, Unit } from '../types';

/** Spread radius and duration when Wildfire or Plague passes an effect on (tiles, ms). */
export const SPREAD_RADIUS = 1.6;
export const SPREAD_MS = 3000;

function owns(ctx: SimCtx, source: number | null, card: 'wildfire' | 'plague'): boolean {
  if (source === null) return false;
  const s = state(ctx);
  if (s.kinds.get(source) !== 'player') return false;
  return ((s.units.get(source) as PlayerEnt | undefined)?.cards[card] ?? 0) > 0;
}

/** Passes `fx` from a dying enemy to every living enemy near it (Wildfire, Plague). */
function spread(ctx: SimCtx, self: Unit, fx: StatusEffect) {
  const s = state(ctx);
  for (const e of s.world.enemies) {
    if (e === self || e.hp <= 0) continue;
    if (dist(self.x, self.y, e.x, e.y) - e.r > SPREAD_RADIUS) continue;
    ctx.applyEffect(
      e.id,
      { effect: fx.def, strength: fx.strength, durationMs: SPREAD_MS },
      fx.source,
    );
  }
}

function dotDef(
  id: 'burn' | 'poison',
  maxStacks: number,
  tickEveryMs: number,
  combo: 'wildfire' | 'plague',
): EffectDef {
  return {
    id,
    stacking: 'stack',
    maxStacks,
    tickEveryMs,
    modifier: () => ({
      id: `effect:${id}`,
      hooks: {
        onDeath(ctx, self) {
          const fx = self.effects.find((x) => x.def === id);
          if (fx && owns(ctx, fx.source, combo)) spread(ctx, self, fx);
        },
      },
    }),
  };
}

/** Fire Arrows (§6.1): damage per tick × stacks, every 0.5 s. */
export const burnEffect = dotDef('burn', 3, 500, 'wildfire');
/** Venom Bolts (§6.1): damage per tick × stacks, every second. */
export const poisonEffect = dotDef('poison', 5, 1000, 'plague');

/**
 * Overflow's temporary shield (§6.1): its strength is the HP it still absorbs. The damage pipeline's
 * shield stage (state.ts) spends it; Overflow adds to it directly (up to its cap).
 */
export const shieldEffect: EffectDef = {
  id: 'shield',
  stacking: 'refresh',
  modifier: () => ({ id: 'effect:shield' }),
};

/** Bodyguard (Warden) and Vanguard (Commander) auras: damage reduction (capped, §6.1). */
export const bodyguardAura: EffectDef = {
  id: 'aura_bodyguard',
  stacking: 'refresh',
  modifier: (k) => ({ id: 'effect:aura_bodyguard', stats: [{ stat: 'damageReduction', add: k }] }),
};
export const vanguardAura: EffectDef = {
  id: 'aura_vanguard',
  stacking: 'refresh',
  modifier: (k) => ({ id: 'effect:aura_vanguard', stats: [{ stat: 'damageReduction', add: k }] }),
};

/** Light Load (Quartermaster): allies in the Field Medic aura feel `k` less of the carry slowdown. */
export const lightLoadAura: EffectDef = {
  id: 'aura_field_medic',
  stacking: 'refresh',
  modifier: (k) => ({
    id: 'effect:aura_field_medic',
    stats: [{ stat: 'carrySlowdown', addPct: -k }],
  }),
};

/** Spends a unit's shield on a hit; returns what it absorbed (state.ts damage stage 5). */
export function absorbShield(u: Unit, amount: number): number {
  const i = u.effects.findIndex((x) => x.def === 'shield');
  if (i < 0 || amount <= 0) return 0;
  const fx = u.effects[i]!;
  const took = Math.min(fx.strength, amount);
  fx.strength -= took;
  if (fx.strength <= 1e-9) u.effects.splice(i, 1);
  return took;
}

/** The HP a unit's shield still absorbs (0 = none): render's Overflow icon. */
export function shieldOf(u: { effects: readonly StatusEffect[] }): number {
  return u.effects.find((x) => x.def === 'shield')?.strength ?? 0;
}
