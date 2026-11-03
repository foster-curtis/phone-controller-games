// Quartermaster passive, Field Medic (SPEC §8): a small regeneration aura for nearby players (him
// included), off during the build phase. Its healing charges his super at `chargeRate` per HP healed,
// more slowly than damage does; the super's own healing never charges it (only this module charges
// from heals). Ticks on whole-second step multiples, so it needs no state.
import { dist } from '../geometry';
import { state } from '../internal';
import type { ModuleDef, PlayerEnt } from '../types';

const num = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback);

export const fieldMedic: ModuleDef = {
  id: 'field_medic',
  make(params) {
    const radius = num(params.radius, 2.5);
    const heal = num(params.heal, 3);
    const everyMs = num(params.everyMs, 1000);
    const chargeRate = num(params.chargeRate, 0.002);
    return {
      id: 'passive:field_medic',
      hooks: {
        onTick(ctx, self) {
          const s = state(ctx);
          const w = s.world;
          const p = self as PlayerEnt;
          if (w.phase !== 'combat' || !s.targetable(p)) return;
          if (w.tick % s.cat.steps(everyMs) !== 0) return;
          const r = s.attackStat(p, radius, 'auraRadius');
          const amount = s.attackStat(p, heal, 'healing');
          let healed = 0;
          for (const q of w.players) {
            if (!s.targetable(q) || q.hp >= q.maxHp) continue;
            if (dist(p.x, p.y, q.x, q.y) > r + q.r) continue;
            healed += ctx.heal(q.id, amount, p.id).healed;
          }
          if (healed > 0 && p.superCharge < 1) {
            p.superCharge = Math.min(1, p.superCharge + healed * chargeRate);
            if (p.superCharge >= 1) ctx.emit({ e: 'superReady', slot: p.slot });
          }
        },
      },
    };
  },
};

/** The aura's radius for a Quartermaster (render's dotted circle; params as content gives them). */
export function fieldMedicRadius(params: Record<string, unknown> | undefined): number {
  return num(params?.radius, 2.5);
}
