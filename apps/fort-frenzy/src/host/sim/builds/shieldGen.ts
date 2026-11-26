// The Warden's shield generator (SPEC §7.4): a thrown HP build. While active in combat it re-applies
// `guard` (damage reduction: `BuildDef.guard` through the owner's `buildPower`) to allied knights and
// squad soldiers within its radius (`buildRadius`), as a short aura (`module.params.auraMs`); where
// generators overlap the strongest wins (the effect's `strongest` stacking). Builds aren't guarded.
// The reduction is applied in the damage pipeline after the capped card reduction (state.ts).
import type { BuildDef } from '../../../content/types';
import { num } from '../cards/common';
import { dist } from '../geometry';
import type { SimState } from '../internal';
import type { BuildEnt, EffectApply } from '../types';
import type { BuildBehavior } from './index';

function params(def: BuildDef): { guard: number; auraMs: number } {
  if (def.guard === undefined) throw new Error(`build '${def.id}' has no guard in content`);
  return { guard: def.guard, auraMs: num(def.module?.params, 'auraMs') };
}

export const shieldGen: BuildBehavior = {
  id: 'shield_gen',
  check(def) {
    params(def);
  },
  combat(s: SimState, b: BuildEnt, def: BuildDef) {
    const owner = s.player(b.owner);
    if (!owner) return;
    const { guard, auraMs } = params(def);
    const radius = s.attackStat(owner, def.radius, 'buildRadius', 'build');
    const fx: EffectApply = {
      effect: 'guard',
      strength: s.attackStat(owner, guard, 'buildPower', 'build'),
      durationMs: auraMs,
    };
    const w = s.world;
    for (const p of w.players)
      if (s.targetable(p) && dist(b.x, b.y, p.x, p.y) <= radius) s.applyEffect(p.id, fx, b.id);
    for (const u of w.soldiers)
      if (u.hp > 0 && !u.flight && dist(b.x, b.y, u.x, u.y) <= radius)
        s.applyEffect(u.id, fx, b.id);
  },
};

/** The strongest `guard` on a unit (0 = none): the damage pipeline's last reduction (§15.3). */
export function guardOf(effects: readonly { def: string; strength: number }[]): number {
  let g = 0;
  for (const e of effects) if (e.def === 'guard' && e.strength > g) g = e.strength;
  return g;
}
