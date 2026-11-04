// Engineer passive, Steady Aim (SPEC §8, §10.1): standing still (movement stick released) for a short
// time boosts the main attack's damage and range. `onTick` reads the player's `stillTicks`; the range
// bonus is a scoped stat mod while active, the damage bonus rides on the shots fired while active
// (tag `steady`, applied in `modifyOutgoing`, pipeline stage 2).
import type { StatMod } from '../../../content/types';
import { msToSteps } from '../../systems/effects';
import { num } from '../cards/common';
import { state } from '../internal';
import { SIM_HZ, type Modifier, type ModuleDef, type PlayerEnt } from '../types';

export const steadyAim: ModuleDef = {
  id: 'steady_aim',
  make(params) {
    const stillMs = num(params, 'stillMs');
    const damagePct = num(params, 'damagePct');
    const bonus: readonly StatMod[] = [
      { stat: 'range', addPct: num(params, 'rangePct'), scope: 'main' },
    ];
    const none: readonly StatMod[] = [];
    let active = false;
    const m: Modifier = {
      id: 'passive:steady_aim',
      get stats() {
        return (active ? bonus : none) as StatMod[];
      },
      hooks: {
        onTick(ctx, self) {
          // The wait is the passive's duration, so Deadeye (FF12) shortens it as a stat.
          const wait = state(ctx).attackStat(self, stillMs, 'durationMs', 'passive');
          active = (self as PlayerEnt).stillTicks >= msToSteps(wait, SIM_HZ);
        },
        onAttack(_ctx, _self, atk) {
          if (active && atk.slot === 'main') atk.tags.push('steady');
        },
        modifyOutgoing(_ctx, _self, d) {
          if (d.tags.includes('steady')) d.amount *= 1 + damagePct;
        },
      },
    };
    return m;
  },
};
