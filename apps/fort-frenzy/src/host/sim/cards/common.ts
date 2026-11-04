// Shared helpers for card modules (SPEC §6.1): param reading, the stack count every card module is
// built with (`stacks`, ×N), and the "vs enemy type" damage bonus (Skyhunter, Giant Slayer).
import type { EnemyId } from '../../../shared/ids';
import { state } from '../internal';
import type { EnemyEnt, Modifier, ModuleDef, SimCtx } from '../types';

export type Params = Record<string, number | string | boolean>;

export const num = (p: Params, key: string, fallback: number): number =>
  typeof p[key] === 'number' ? (p[key] as number) : fallback;

/** Stacks the card is held at (×N, §6.1); 1 if absent. */
export const stacksOf = (p: Params): number => Math.max(1, num(p, 'stacks', 1));

/** The enemy a hit lands on, or null when the target isn't an enemy. */
export function enemyTarget(ctx: SimCtx, id: number): EnemyEnt | null {
  const s = state(ctx);
  return s.kinds.get(id) === 'enemy' ? ((s.units.get(id) as EnemyEnt | undefined) ?? null) : null;
}

/** +`pct` × stacks damage against the listed enemy kinds (params `enemies`: comma-separated ids). */
export function vsEnemies(id: string, fallback: EnemyId[]): ModuleDef {
  return {
    id,
    make(p) {
      const kinds = new Set(typeof p.enemies === 'string' ? p.enemies.split(',') : fallback);
      const bonus = num(p, 'pct', 0.5) * stacksOf(p);
      const m: Modifier = {
        id: `card:${id}`,
        hooks: {
          modifyOutgoing(ctx, _self, d) {
            const e = enemyTarget(ctx, d.target);
            if (e && kinds.has(e.kind)) d.amount *= 1 + bonus;
          },
        },
      };
      return m;
    },
  };
}
