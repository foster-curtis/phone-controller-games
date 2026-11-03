// Scrap mite (Swarm) clips (SPEC §9.6): six short legs flicker. Each mite of a pack plays at its own
// speed and phase and runs its own jittery path (render/swarm.ts), so a pack scatters, bunches and
// re-layers as it moves (C1 note 3) and is never in step.
import rig from '../../../../art/neon-knights/rigs/mite.json';
import type { Clip, RigDef } from '../../../themes/types';
import { enemyDeath, enemyHit, idleBob, loop, sin, wave } from '../clipKit';

export const clips: Record<string, Clip> = {
  idle: idleBob(900, ['body'], 0.6),
  walk: loop(
    240,
    { body: wave(240, 4, (u) => ({ dy: -0.8 * Math.abs(sin(u)) })) },
    { 'legs-near': wave(240, 4, (u) => ({ dx: 1.2 * sin(u), rot: 6 * sin(u) })) },
    { 'legs-far': wave(240, 4, (u) => ({ dx: -1.2 * sin(u), rot: -6 * sin(u) })) },
  ),
  hit: enemyHit(['body'], 12, 2, 200),
  death: enemyDeath(rig as unknown as RigDef, {
    start: 60,
    fall: 260,
    stagger: 60,
    hold: 400,
    fadeMs: 400,
  }),
};
