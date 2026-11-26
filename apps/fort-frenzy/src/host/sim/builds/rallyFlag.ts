// The Commander's rally flag (SPEC §7.4, §8.4): a thrown build that can't be attacked and stays until
// it's recalled or replaced, between waves too. Thrown, his squad heads for its landing spot at once.
// With the Morale card it also holds the morale area (§6.1), and like any build it keeps working while
// he's down (§7.1).
import type { BuildDef } from '../../../content/types';
import { num } from '../cards/common';
import { applyMorale } from '../modules/morale';
import type { SimState } from '../internal';
import type { BuildEnt, PlayerEnt } from '../types';
import type { BuildBehavior } from './index';

export const rallyFlag: BuildBehavior = {
  id: 'rally_flag',
  check(_def: BuildDef) {},
  placed(s: SimState, p: PlayerEnt, b: BuildEnt) {
    const at = b.flight?.to ?? b;
    p.flag = { x: at.x, y: at.y };
    for (const u of s.world.soldiers) {
      if (u.owner !== p.slot) continue;
      u.mode = 'rally';
      u.target = null;
    }
    s.emit({ e: 'flag', slot: p.slot, action: 'plant' });
  },
  combat(s: SimState, b: BuildEnt) {
    const owner = s.player(b.owner);
    if (!owner || (owner.cards.morale ?? 0) <= 0) return;
    const params = s.cat.content.cards.find((c) => c.id === 'morale')?.module?.params;
    applyMorale(s, owner.id, b.x, b.y, num(params, 'flagRadius'), {
      effect: 'morale',
      strength: num(params, 'strength'),
      durationMs: num(params, 'auraMs'),
    });
  },
};
