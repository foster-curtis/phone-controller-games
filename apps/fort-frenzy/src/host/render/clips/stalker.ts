// Stalker (Hunter) clips (SPEC §9.6): a fast loping run with lifted forward swings. Attack (FF10):
// the tell is a low crouch (body and head drop, legs gather), then a lunge forward on the content
// wind-up's end, and a recovery.
import rig from '../../../../art/neon-knights/rigs/stalker.json';
import type { Clip, RigDef } from '../../../themes/types';
import { each, enemyDeath, enemyHit, idleBob, once, sin, walkerWalk, wave } from '../clipKit';

/** The Hunter's wind-up is 400 ms (content); the lunge lands then. */
export const STALKER_LUNGE_MS = 400;

const LEGS = ['leg-far-rear', 'leg-near-rear', 'leg-far-front', 'leg-near-front'];

const attack: Clip = once(
  820,
  {
    body: [
      { t: 0, rot: 0, dx: 0, dy: 0 },
      { t: 320, rot: 5, dx: -3, dy: 6 },
      { t: STALKER_LUNGE_MS - 20, rot: 5, dx: -3, dy: 6 },
      { t: STALKER_LUNGE_MS + 60, rot: -6, dx: 12, dy: -2 },
      { t: 600, rot: -3, dx: 8, dy: 0 },
      { t: 820, rot: 0, dx: 0, dy: 0 },
    ],
    head: [
      { t: 0, rot: 0 },
      { t: 320, rot: 6 },
      { t: STALKER_LUNGE_MS + 60, rot: -10 },
      { t: 820, rot: 0 },
    ],
    tail: [
      { t: 0, rot: 0 },
      { t: 320, rot: -12 },
      { t: STALKER_LUNGE_MS + 60, rot: 14 },
      { t: 820, rot: 0 },
    ],
  },
  each(LEGS, [
    { t: 0, sy: 1, rot: 0 },
    { t: 320, sy: 0.84, rot: 0 },
    { t: STALKER_LUNGE_MS + 60, sy: 1.04, rot: -10 },
    { t: 820, sy: 1, rot: 0 },
  ]),
);

export const clips: Record<string, Clip> = {
  idle: idleBob(
    1600,
    ['body'],
    1,
    each(
      ['tail'],
      wave(1600, 8, (u) => ({ rot: 6 * sin(u) })),
    ),
  ),
  walk: walkerWalk(
    440,
    ['body'],
    ['leg-far-rear', 'leg-near-rear'],
    ['leg-far-front', 'leg-near-front'],
    24,
    2.5,
    {
      body: wave(440, 16, (u) => ({ dy: -2.5 * Math.abs(sin(u)), rot: 3 * sin(u) })),
      tail: wave(440, 8, (u) => ({ rot: 10 * sin(u, 0.25) })),
    },
    0.16,
  ),
  hit: enemyHit(['body'], 7, 3),
  death: enemyDeath(rig as unknown as RigDef),
  attack,
};
