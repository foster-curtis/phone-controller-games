// Commander kit (SPEC §8.2, §7.4): the rally flag is his build (RD9 throws it). With the meter not full
// and a flag out, the build button recalls it and his squad follows him again; recall never uses the
// meter (§15.11 #83). The flag's position persists across phases. Morale is the `buff` shape
// (classes/shapes.ts) until RD9, Lead from the Front a passive module, the squad is squad/.
import type { FullState } from '../state';
import type { PlayerEnt } from '../types';

/** The build button's recall (§7.4): no-op without a planted flag. */
export function recallFlag(s: FullState, p: PlayerEnt): void {
  if (p.flag === null) return;
  p.flag = null;
  for (const u of s.world.soldiers) {
    if (u.owner !== p.slot) continue;
    u.mode = 'follow';
    u.target = null;
  }
  s.emit({ e: 'recall', slot: p.slot });
}
