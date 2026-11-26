// Field Medic, the Artificer's passive card (SPEC §6.1, §8): a small healing aura for nearby knights
// (him included), in combat only. Its healing charges his super (§8.3) and his build meter (§7.2), the
// one healing that charges the meter. Ticks on whole-second step multiples, so it needs no state.
import { chargeMeter } from '../builds/meter';
import { num } from '../cards/common';
import { chargeSuperFromHeal, healKnights } from '../classes/artificer';
import { dist } from '../geometry';
import { state } from '../internal';
import type { ModuleDef, PlayerEnt } from '../types';

export const fieldMedic: ModuleDef = {
  id: 'field_medic',
  make(params) {
    const radius = num(params, 'radius');
    const heal = num(params, 'heal');
    const everyMs = num(params, 'everyMs');
    return {
      id: 'card:field_medic',
      hooks: {
        onTick(ctx, self) {
          const s = state(ctx);
          const w = s.world;
          const p = self as PlayerEnt;
          if (w.phase !== 'combat' || !s.targetable(p)) return;
          if (w.tick % s.cat.steps(everyMs) !== 0) return;
          const r = s.attackStat(p, radius, 'auraRadius');
          const amount = s.attackStat(p, heal, 'healing');
          const healed = healKnights(s, p, amount, (q) => dist(p.x, p.y, q.x, q.y) <= r + q.r);
          chargeMeter(s, p, healed, 'healing');
          chargeSuperFromHeal(s, p, healed);
        },
      },
    };
  },
};
