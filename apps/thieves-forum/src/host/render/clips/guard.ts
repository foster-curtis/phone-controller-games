// Guard clips (SPEC §6.12, §6.13, §6.21, §12.2): idle, patrol walk, jog (chase), catch and the march
// to the stocks. ART_NOTES: guards walk and jog in the side view; front and back get the same gaits.
import type { Clip } from '../types';
import {
  breathe,
  gaitFront,
  gaitSide,
  hold,
  keys,
  loop,
  once,
  sideStand,
  type GaitParts,
} from './kit';

const P: GaitParts = { root: 'cuirass', head: 'head' };
const PATROL_MS = 1100;
const JOG_MS = 560;
const MARCH_MS = 800;

/** The grab: lunge and reach for the thief. */
const catchFront = once(500, {
  'arm-l': keys([0, { rot: 0 }], [200, { rot: 110 }], [500, { rot: 90 }]),
  cuirass: keys([0, { dy: 0 }], [200, { dy: 1 }], [500, { dy: 0.5 }]),
});
const catchSide = once(500, sideStand(), {
  'arm-r': keys([0, { rot: 0 }], [200, { rot: -100 }], [500, { rot: -85 }]),
  cuirass: keys([0, { rot: 0, dx: 0 }], [200, { rot: 6, dx: 1.5 }], [500, { rot: 3, dx: 1 }]),
});

/** March: a stiff, high step, the hand out holding the thief (§6.13). */
const marchFront = loop(MARCH_MS, gaitFront(MARCH_MS, P, { legs: 24, arms: 0, bob: 0.4 }), {
  'arm-r': hold({ rot: -35 }),
});
const marchSide = loop(MARCH_MS, gaitSide(MARCH_MS, P, { legs: 20, arms: 0, bob: 0.4 }), {
  'arm-r': hold({ rot: -60 }),
});

export const clips: Record<string, Clip> = {
  idle: loop(3000, breathe(3000, P, 0.4)),
  'idle@side': loop(3000, sideStand(), breathe(3000, P, 0.4)),
  patrol: loop(PATROL_MS, gaitFront(PATROL_MS, P, { legs: 14, arms: 8, bob: 0.4 })),
  'patrol@side': loop(PATROL_MS, gaitSide(PATROL_MS, P, { legs: 12, arms: 12, bob: 0.4 })),
  jog: loop(JOG_MS, gaitFront(JOG_MS, P, { legs: 26, arms: 24, bob: 1 })),
  'jog@side': loop(JOG_MS, gaitSide(JOG_MS, P, { legs: 22, arms: 30, bob: 1 })),
  catch: catchFront,
  'catch@side': catchSide,
  march: marchFront,
  'march@side': marchSide,
};
