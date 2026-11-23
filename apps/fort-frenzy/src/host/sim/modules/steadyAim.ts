// The Ranger's passive card, Steady Aim (SPEC §6.1, §8.2, §10.1): standing still (movement stick
// released) for a short time boosts the main attack's damage and range. `onTick` reads the player's
// `stillTicks`; the range bonus is a scoped stat mod while active, the damage bonus rides on the shots
// fired while active (tag `steady`, applied in `modifyOutgoing`, pipeline stage 2).
import type { StatMod } from '../../../content/types';
import { msToSteps } from '../../systems/effects';
import { num } from '../cards/common';
import { state } from '../internal';
import { SIM_HZ, type Modifier, type ModuleDef, type PlayerEnt } from '../types';

/** Kept on the modifier, so the state hash and the TV read it (the pose shows only when owned). */
type SteadyModifier = Modifier & { active: boolean };

/** Is `p`'s Steady Aim on now? False without the card (RD7: its visuals show only when owned). */
export function steadyOn(p: Pick<PlayerEnt, 'mods'>): boolean {
  const m = p.mods.find((x) => x.id === 'card:steady_aim') as SteadyModifier | undefined;
  return m?.active === true;
}

export const steadyAim: ModuleDef = {
  id: 'steady_aim',
  make(params) {
    const stillMs = num(params, 'stillMs');
    const damagePct = num(params, 'damagePct');
    const bonus: readonly StatMod[] = [
      { stat: 'range', addPct: num(params, 'rangePct'), scope: 'main' },
    ];
    const none: readonly StatMod[] = [];
    const m: SteadyModifier = {
      id: 'passive:steady_aim',
      active: false,
      get stats() {
        return (m.active ? bonus : none) as StatMod[];
      },
      hooks: {
        onTick(ctx, self) {
          // The wait is the passive's duration, so Deadeye (FF12) shortens it as a stat.
          const wait = state(ctx).attackStat(self, stillMs, 'durationMs');
          m.active = (self as PlayerEnt).stillTicks >= msToSteps(wait, SIM_HZ);
        },
        onAttack(_ctx, _self, atk) {
          if (m.active && atk.slot === 'main') atk.tags.push('steady');
        },
        modifyOutgoing(_ctx, _self, d) {
          if (d.tags.includes('steady')) d.amount *= 1 + damagePct;
        },
      },
    };
    return m;
  },
};
