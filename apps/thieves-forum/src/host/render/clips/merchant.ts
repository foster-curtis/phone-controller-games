// Merchant clips (SPEC §6.6, §6.21, §12.2): walk along the counter, idle, the glance in three
// stages (wind-up half-turn, look, back), fetch from the back shelf, carry an item forward, and
// point-and-shout. No point-back drawing was delivered, so `point@back` raises the base arm
// (BUILD_PLAN §8). There is no 3/4 head: the glance turns the head with a squeeze and a shift.
import type { Clip } from '../types';
import {
  breathe,
  gaitFront,
  gaitSide,
  hold,
  keys,
  loop,
  once,
  posed,
  sideStand,
  wave,
  type GaitParts,
} from './kit';

const P: GaitParts = { root: 'tunic', head: 'head' };
const WALK_MS = 1000;

/** Stage 1: the half-turn wind-up, the fair warning (glance swoosh shows meanwhile). */
const glanceWindup = once(400, {
  head: keys([0, { rot: 0, dx: 0, sx: 1 }], [400, { rot: 6, dx: 1.2, sx: 0.92 }]),
});
/** Stage 2: the look. */
const glanceLook = once(250, {
  head: keys([0, { rot: 6, dx: 1.2, sx: 0.92 }], [250, { rot: 10, dx: 2.2, sx: 0.85 }]),
  tunic: keys([0, { rot: 0 }], [250, { rot: 2 }]),
});
/** Stage 3: back to the customer. */
const glanceBack = once(400, {
  head: keys([0, { rot: 10, dx: 2.2, sx: 0.85 }], [400, { rot: 0, dx: 0, sx: 1 }]),
  tunic: keys([0, { rot: 2 }], [400, { rot: 0 }]),
});

/** Fetch: reach up to the back shelf (seen from behind), take, lower. */
const fetch = once(1200, {
  'arm-r': keys(
    [0, { rot: 0 }],
    [500, { rot: -165, sy: 0.9 }],
    [800, { rot: -165, sy: 0.9 }],
    [1200, { rot: 0, sy: 1 }],
  ),
  head: keys([0, { dy: 0 }], [500, { dy: -0.8 }], [800, { dy: -0.8 }], [1200, { dy: 0 }]),
});
const fetchSide = once(1200, sideStand(), {
  'arm-r': keys([0, { rot: 0 }], [500, { rot: -130 }], [800, { rot: -130 }], [1200, { rot: 0 }]),
});

/** Carry an item forward: arms held in front, walking. */
const carryFront = gaitFront(WALK_MS, P, { legs: 14, arms: 0, bob: 0.5 });
const carry = loop(WALK_MS, carryFront, {
  'arm-l': hold({ rot: -45, sy: 0.85 }),
  'arm-r': hold({ rot: 45, sy: 0.85 }),
});
const carrySide = loop(WALK_MS, gaitSide(WALK_MS, P, { legs: 14, arms: 0, bob: 0.5 }), {
  'arm-l': hold({ rot: -70 }),
  'arm-r': hold({ rot: -75 }),
});

const pointShake = loop(500, {
  head: wave(500, 4, (u) => ({ rot: 3 * Math.sin(u * Math.PI * 2) })),
});

export const clips: Record<string, Clip> = {
  idle: loop(2600, breathe(2600, P)),
  'idle@side': loop(2600, sideStand(), breathe(2600, P)),
  walk: loop(WALK_MS, gaitFront(WALK_MS, P, { legs: 16, arms: 10, bob: 0.5 })),
  'walk@side': loop(WALK_MS, gaitSide(WALK_MS, P, { legs: 14, arms: 16, bob: 0.5 })),
  glanceWindup,
  glanceLook,
  glanceBack,
  fetch,
  'fetch@side': fetchSide,
  carry,
  'carry@side': carrySide,
  point: posed(pointShake, 'point', ['shout']),
  'point@side': posed(loop(500, sideStand(), pointShake.tracks), 'point'),
  'point@back': loop(500, pointShake.tracks, { 'arm-l': hold({ rot: 90 }) }),
};
