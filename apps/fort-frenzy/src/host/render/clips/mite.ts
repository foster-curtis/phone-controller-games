// Scrap mite (Swarm) clips (SPEC §9.6): six short legs flicker. Each mite of a pack plays at its own
// speed and phase and runs its own jittery path (render/swarm.ts), so a pack scatters, bunches and
// re-layers as it moves (C1 note 3) and is never in step. Attack (FF10): a quick rear-back, then a
// bite on the content wind-up's end.
import rig from '../../../../art/neon-knights/rigs/mite.json';
import type { Clip, RigDef } from '../../../themes/types';
import { enemyDeath, enemyHit, idleBob, loop, once, sin, wave } from '../clipKit';

/** The Swarm's wind-up is 150 ms (content); the bite lands then. */
export const MITE_BITE_MS = 150;

const attack: Clip = once(340, {
  body: [
    { t: 0, dx: 0, rot: 0 },
    { t: 110, dx: -1.5, rot: -8 },
    { t: MITE_BITE_MS, dx: 2.5, rot: 6 },
    { t: 340, dx: 0, rot: 0 },
  ],
  head: [
    { t: 0, rot: 0 },
    { t: 110, rot: -14 },
    { t: MITE_BITE_MS, rot: 12 },
    { t: 340, rot: 0 },
  ],
});

export const clips: Record<string, Clip> = {
  attack,
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
