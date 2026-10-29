// Scrap mite (Swarm) clips (SPEC §9.6): six short legs flicker. Each mite of a pack plays at its own
// speed and phase, with jittery paths from a seeded hash (render/swarm.ts), so a pack is never in step.
import type { Clip } from '../../../themes/types';
import { idleBob, loop, sin, wave } from '../clipKit';

export const clips: Record<string, Clip> = {
  idle: idleBob(900, ['body'], 0.6),
  walk: loop(
    240,
    { body: wave(240, 4, (u) => ({ dy: -0.8 * Math.abs(sin(u)) })) },
    { 'legs-near': wave(240, 4, (u) => ({ dx: 1.2 * sin(u), rot: 6 * sin(u) })) },
    { 'legs-far': wave(240, 4, (u) => ({ dx: -1.2 * sin(u), rot: -6 * sin(u) })) },
  ),
};
