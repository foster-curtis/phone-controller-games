// The Artificer's healing beacon (SPEC §7.4): a thrown HP build. While active in combat it pulses every
// `heal.everyMs`, healing allied knights in its radius (not soldiers, not builds). The heal goes through
// the owner's hooks (Triage, Overflow). It charges his super and never his meter (§7.2), and it keeps
// working while he is down. `nextPulse` also tells the TV when to draw the ring.
import type { BuildDef } from '../../../content/types';
import { chargeSuperFromHeal, healKnights } from '../classes/artificer';
import { dist } from '../geometry';
import type { SimState } from '../internal';
import type { BuildEnt } from '../types';
import type { BuildBehavior } from './index';

function params(def: BuildDef): { amount: number; everyMs: number } {
  if (!def.heal) throw new Error(`build '${def.id}' has no heal in content`);
  return def.heal;
}

export const beacon: BuildBehavior = {
  id: 'beacon',
  check(def) {
    params(def);
  },
  combat(s: SimState, b: BuildEnt, def: BuildDef) {
    const t = s.world.tick;
    if (b.nextPulse !== null && t < b.nextPulse) return;
    const owner = s.player(b.owner);
    if (!owner) return;
    const { amount, everyMs } = params(def);
    b.nextPulse = t + s.cat.steps(everyMs);
    const radius = s.attackStat(owner, def.radius, 'buildRadius', 'build');
    const heal = s.attackStat(owner, amount, 'buildPower', 'build');
    const healed = healKnights(s, owner, heal, (q) => dist(b.x, b.y, q.x, q.y) <= radius);
    chargeSuperFromHeal(s, owner, healed);
  },
};
