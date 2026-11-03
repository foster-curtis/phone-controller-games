// Commander kit (SPEC §8, §10.1 row 7): the rally flag. In combat the action button plants it at his
// feet, and his squad holds the flag's position; tapping again recalls it and the squad follows him.
// The flag's position persists across phases (BUILD_PLAN §8). Morale is the `buff` shape
// (classes/shapes.ts), Lead from the Front a passive module, the squad is squad/.
import type { FullState } from '../state';
import type { PlayerEnt } from '../types';

/** Row 7: plant the flag, or recall it if planted. */
export function toggleFlag(s: FullState, p: PlayerEnt): void {
  const plant = p.flag === null;
  p.flag = plant ? { x: p.x, y: p.y } : null;
  for (const u of s.world.soldiers) {
    if (u.owner !== p.slot) continue;
    u.mode = plant ? 'rally' : 'follow';
    u.target = null;
  }
  s.emit({ e: 'flag', slot: p.slot, action: plant ? 'plant' : 'recall' });
}
