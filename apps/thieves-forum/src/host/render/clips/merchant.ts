// Merchant clips (SPEC §6.6, §6.21, §12.2): walk along the counter, idle, the glance in three
// stages (wind-up half-turn, look, back), fetch from the back shelf, carry an item forward, and
// point-and-shout. No point-back drawing was delivered, so `point@back` raises the base arm
// (BUILD_PLAN §8). TF1-fix-1 (user C1 notes): the glance is staged across views (head first, then
// the body), carry shows both arms, fetch and other raised near arms draw in front of the head, and
// front/back points aim into / out of the screen.
import type { Clip } from '../types';
import { GLANCE_MS } from '../glance';
import {
  aimedGlanceClips,
  breathe,
  gaitFront,
  gaitSide,
  glanceClips,
  hold,
  keys,
  loop,
  once,
  POINT_OUT,
  posed,
  sideStand,
  wave,
  type GaitParts,
} from './kit';

const P: GaitParts = { root: 'tunic', head: 'head' };
const WALK_MS = 1000;

/**
 * The glance in three stages (§6.6): wind-up = the head alone turns (side head over a front/back
 * body, front head over a side body; the glance swoosh shows meanwhile, the fair warning), look =
 * the whole body turns that way, back = the body returns, then the head.
 */
const { glanceWindup, glanceLook, glanceBack } = glanceClips(P, {
  windup: 400,
  look: 1200,
  back: 600,
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
// Both arms reach up; the near one is drawn in front of the head (user C1 note 6).
const fetchSide: Clip = {
  ...once(1200, sideStand(), {
    'arm-l': keys([0, { rot: 0 }], [500, { rot: -150 }], [800, { rot: -150 }], [1200, { rot: 0 }]),
    'arm-r': keys([0, { rot: 0 }], [500, { rot: -140 }], [800, { rot: -140 }], [1200, { rot: 0 }]),
  }),
  reorder: { 'arm-r': 'top' },
};

/**
 * Carry an item forward, walking (user C1 note 6). Front: forearms come toward the camera, so the
 * arms foreshorten and turn in over the apron (drawn in front of it). Back: the arms reach forward,
 * away from the camera, so only the upper arms show beside the body, slightly out and shortened.
 */
const carryGait = gaitFront(WALK_MS, P, { legs: 14, arms: 0, bob: 0.5 });
const carry: Clip = {
  ...loop(WALK_MS, carryGait, {
    'arm-l': hold({ rot: -28, sy: 0.72 }),
    'arm-r': hold({ rot: 28, sy: 0.72 }),
  }),
  reorder: { 'arm-l': 'apron', 'arm-r': 'arm-l' },
};
const carryBack = loop(WALK_MS, carryGait, {
  'arm-l': hold({ rot: 12, sy: 0.8 }),
  'arm-r': hold({ rot: -12, sy: 0.8 }),
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
  // Glances aimed at the theft (TF1-fix-2): played step by step from render/glance.ts.
  ...aimedGlanceClips(P, GLANCE_MS),
  fetch,
  'fetch@side': fetchSide,
  carry,
  'carry@back': carryBack,
  'carry@side': carrySide,
  // Front: point out of the screen, down over the chest (user C1 note 7), in front of the apron.
  point: {
    ...posed(loop(500, pointShake.tracks, { 'arm-l': hold({ ...POINT_OUT }) }), 'point', ['shout']),
    reorder: { 'arm-l': 'apron' },
  },
  'point@side': posed(loop(500, sideStand(), pointShake.tracks), 'point'),
  // Back: the base arm raised up and a little out, foreshortened: pointing into the screen.
  'point@back': loop(500, pointShake.tracks, { 'arm-l': hold({ rot: 158, sy: 0.72 }) }),
};
