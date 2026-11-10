// Commander passive, Lead from the Front (SPEC §8): his soldiers deal more damage while near him. An
// aura (§15.3): a short `aura_lead_from_the_front` effect re-applied each step to his soldiers in
// range, with `refresh`, while he is up.
import { dist } from '../geometry';
import { num } from '../cards/common';
import { state } from '../internal';
import type { ModuleDef, PlayerEnt } from '../types';

export const leadFromTheFront: ModuleDef = {
  id: 'lead_from_the_front',
  make(params) {
    const radius = num(params, 'radius');
    const damagePct = num(params, 'damagePct');
    const auraMs = num(params, 'auraMs');
    return {
      id: 'passive:lead_from_the_front',
      hooks: {
        onTick(ctx, self) {
          const s = state(ctx);
          const p = self as PlayerEnt;
          if (!s.targetable(p)) return;
          const r = s.attackStat(p, radius, 'auraRadius');
          for (const u of s.world.soldiers) {
            if (u.owner !== p.slot || u.hp <= 0 || dist(p.x, p.y, u.x, u.y) > r) continue;
            ctx.applyEffect(
              u.id,
              { effect: 'aura_lead_from_the_front', strength: damagePct, durationMs: auraMs },
              p.id,
            );
          }
        },
      },
    };
  },
};
