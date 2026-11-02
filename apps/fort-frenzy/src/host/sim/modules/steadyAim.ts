// Engineer passive, Steady Aim (SPEC §8, §10.1): standing still (movement stick released) for a short
// time boosts the main attack's damage and range. `onTick` reads the player's `stillTicks`; the range
// bonus is a scoped stat mod while active, the damage bonus rides on the shots fired while active
// (tag `steady`, applied in `modifyOutgoing`, pipeline stage 2).
import type { StatMod } from '../../../content/types';
import { msToSteps } from '../../systems/effects';
import { SIM_HZ, type Modifier, type ModuleDef, type PlayerEnt } from '../types';

const num = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback);

export const steadyAim: ModuleDef = {
  id: 'steady_aim',
  make(params) {
    const stillSteps = msToSteps(num(params.stillMs, 600), SIM_HZ);
    const damagePct = num(params.damagePct, 0.25);
    const bonus: readonly StatMod[] = [
      { stat: 'range', addPct: num(params.rangePct, 0.2), scope: 'main' },
    ];
    const none: readonly StatMod[] = [];
    let active = false;
    const m: Modifier = {
      id: 'passive:steady_aim',
      get stats() {
        return (active ? bonus : none) as StatMod[];
      },
      hooks: {
        onTick(_ctx, self) {
          active = (self as PlayerEnt).stillTicks >= stillSteps;
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
