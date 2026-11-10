// Mortar tower clips (SPEC §7.2). A structure doesn't walk: `idle`, and `attack` (the fire: the tube
// kicks down into its dome socket, the dome and ring take the recoil, the bands flare). The tube's
// aim is a code override on top (render/structures.ts), so the recoil rides along with any aim; the
// shell leaves from the `muzzle` point at the clip's start.
import type { Clip } from '../../../themes/types';
import { each, loop, once } from '../clipKit';

export const MORTAR_FIRE_MS = 420;

export const clips: Record<string, Clip> = {
  idle: loop(1000, {}),
  attack: once(
    MORTAR_FIRE_MS,
    {
      tube: [
        { t: 0, dy: 0 },
        { t: 40, dy: 5 },
        { t: 200, dy: 1 },
        { t: MORTAR_FIRE_MS, dy: 0 },
      ],
      dome: [
        { t: 0, sy: 1, dy: 0 },
        { t: 50, sy: 0.93, dy: 1.5 },
        { t: 240, sy: 1, dy: 0 },
      ],
    },
    each(
      ['ring-front', 'ring-back', 'blocks', 'spikes'],
      [
        { t: 0, dy: 0 },
        { t: 60, dy: 1.2 },
        { t: 260, dy: 0 },
      ],
    ),
    each(
      ['band1', 'band2', 'band3'],
      [
        { t: 0, glow: 1 },
        { t: 40, glow: 2.4 },
        { t: MORTAR_FIRE_MS, glow: 1 },
      ],
    ),
  ),
};
