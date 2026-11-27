// Citizen clips (SPEC §6.21, §12.2): players and NPCs share every one, so no clip can tell them
// apart (SPEC §6.11). Browse and reach/grab are one clip (`browse`), so stealing looks like browsing
// (§6.7). Delivered pose drawings: point (front, side, back), handsUp (front), run (side); the other
// views of hands-up and run are composed here as `<clip>@<view>` (BUILD_PLAN §8). TF1-fix-1 (user
// C1 notes): staged glances (NPCs catching pickpockets, §6.8), a real run, point into/out of the
// screen in front and back views, the raised near arm drawn in front of the head in side views.
import type { Clip } from '../types';
import {
  breathe,
  gaitFront,
  gaitSide,
  glanceClips,
  hold,
  keys,
  loop,
  once,
  POINT_IN,
  POINT_OUT,
  posed,
  runFront,
  runSide,
  sideStand,
  wave,
  withGroups,
  type GaitParts,
} from './kit';

const P: GaitParts = { root: 'tunic', head: 'head' };
const WALK_MS = 900;

const idle = loop(2400, breathe(2400, P));
const walk = loop(WALK_MS, gaitFront(WALK_MS, P, { legs: 18, arms: 10, bob: 0.6 }));
const walkSide = loop(WALK_MS, gaitSide(WALK_MS, P, { legs: 16, arms: 18, bob: 0.6 }));

/** Looking over the goods, now and then reaching in (browse = reach/grab, §6.7). */
const browseTrack = (reach: number, sy: number) =>
  keys(
    [0, { rot: 0 }],
    [700, { rot: 0, sy: 1 }],
    [1000, { rot: reach, sy }],
    [1700, { rot: reach, sy }],
    [2100, { rot: 0, sy: 1 }],
    [2400, { rot: 0 }],
  );
const browse = loop(2400, breathe(2400, P, 0.3), {
  'arm-r': browseTrack(-150, 0.8),
  head: keys([0, { dy: 0 }], [1000, { dy: 0.6 }], [1700, { dy: 0.6 }], [2100, { dy: 0 }]),
});
const browseSide = loop(2400, sideStand(), breathe(2400, P, 0.3), {
  'arm-r': browseTrack(-80, 1),
  head: keys([0, { rot: 0 }], [1000, { rot: 6 }], [1700, { rot: 6 }], [2100, { rot: 0 }]),
});

/** A low, close reach into the purse of whoever stands in front (§6.8). */
const pickpocket = loop(1600, {
  'arm-r': keys(
    [0, { rot: 0 }],
    [500, { rot: -30, dy: 1 }],
    [1200, { rot: -34, dy: 1 }],
    [1600, { rot: 0 }],
  ),
  tunic: keys([0, { dy: 0 }], [500, { dy: 0.5 }], [1200, { dy: 0.5 }], [1600, { dy: 0 }]),
});
const pickpocketSide = loop(1600, sideStand(), {
  'arm-r': keys([0, { rot: 0 }], [500, { rot: -50 }], [1200, { rot: -55 }], [1600, { rot: 0 }]),
  tunic: keys([0, { rot: 0 }], [500, { rot: 5 }], [1200, { rot: 5 }], [1600, { rot: 0 }]),
});

/** Coin toss (§6.9): a short wind-back, then a forward swing; the coin leaves at the top. */
export const THROW_RELEASE_MS = 380;
const throwSide = once(700, sideStand(), {
  'arm-r': keys(
    [0, { rot: 0 }],
    [200, { rot: 55 }],
    [THROW_RELEASE_MS, { rot: -150 }],
    [700, { rot: -110 }],
  ),
  tunic: keys(
    [0, { rot: 0 }],
    [200, { rot: -4 }],
    [THROW_RELEASE_MS, { rot: 5 }],
    [700, { rot: 2 }],
  ),
});
const throwFront = once(700, {
  'arm-r': keys(
    [0, { rot: 0 }],
    [200, { rot: 30, sy: 1 }],
    [THROW_RELEASE_MS, { rot: -160, sy: 0.85 }],
    [700, { rot: -120, sy: 0.9 }],
  ),
});

/** Point-and-shout (§6.8): the delivered pose, with a jab and a shake. */
const pointShake = loop(500, {
  head: wave(500, 4, (u) => ({ rot: 3 * Math.sin(u * Math.PI * 2) })),
  tunic: wave(500, 4, (u) => ({ dx: 0.3 * Math.sin(u * Math.PI * 4) })),
});
// Front/back point into / out of the screen (user C1 note 7), in front of the mantle when out.
const jab = (aim: { rot: number; sx: number }) =>
  keys(
    [0, { ...aim }],
    [120, { rot: aim.rot, sx: aim.sx * 1.08 }],
    [250, { ...aim }],
    [500, { ...aim }],
  );
const pointFront: Clip = {
  ...posed(loop(500, pointShake.tracks, { 'arm-l': jab(POINT_OUT) }), 'point'),
  reorder: { 'arm-l': 'mantle' },
};
const pointBack = posed(loop(500, pointShake.tracks, { 'arm-l': jab(POINT_IN) }), 'point');

/** Hands up (§6.14): the front drawing; the other views raise the base arms. */
const handsUp = posed(loop(1200, breathe(1200, P, 0.3)), 'handsUp');
const handsUpBack = loop(1200, breathe(1200, P, 0.3), {
  'arm-l': hold({ rot: 155 }),
  'arm-r': hold({ rot: -155 }),
});
// The near arm is drawn in front of the head (user C1 note 5); the far one stays behind it.
const handsUpSide: Clip = {
  ...loop(1200, sideStand(), breathe(1200, P, 0.3), {
    'arm-l': hold({ rot: -170 }),
    // Up and a little forward, so the near arm passes in front of the brow, not across the face.
    'arm-r': hold({ rot: -145 }),
  }),
  reorder: { 'arm-r': 'top' },
};

/**
 * Run (§6.12, §6.14; user C1 note 3): a true running cycle with pedaling legs, a forward lean and
 * arms pumping at the sides. Side: the delivered run drawing (legs, lean, speed lines) with the base
 * drawing's hanging arms, so they pump beside the body instead of reaching out in front.
 */
const RUN_MS = 460;
const runSideClip: Clip = {
  ...withGroups(
    posed(
      loop(RUN_MS, runSide(RUN_MS, P, { legs: 26, arms: 34, bob: 1, lean: 6, baked: 24 })),
      'run',
    ),
    ['speed'],
  ),
  stages: [{ t: 0, parts: { 'arm-l': { pose: 'base' }, 'arm-r': { pose: 'base' } } }],
};
const run = loop(RUN_MS, runFront(RUN_MS, P, { legs: 26, arms: 0.22, bob: 1.2, lean: 6 }));

/** In the stocks (§6.13): head and hands through the board, a slow sway. */
const stocksTracks = {
  'arm-l': hold({ rot: 95 }),
  'arm-r': hold({ rot: -95 }),
  head: hold({ dy: 1.5 }),
  tunic: wave(3000, 6, (u) => ({ dx: 0.4 * Math.sin(u * Math.PI * 2) })),
};
const stocks = loop(3000, stocksTracks);
const stocksSide = loop(3000, sideStand(), stocksTracks);

/** Caught (§6.13): a flinch, arms thrown up high (user C1 note 8). */
const caught = once(500, {
  tunic: keys([0, { dy: 0 }], [120, { dy: -2 }], [300, { dy: 0 }]),
  'arm-l': keys([0, { rot: 0 }], [150, { rot: 150 }]),
  'arm-r': keys([0, { rot: 0 }], [150, { rot: -150 }]),
});
const caughtSide: Clip = {
  ...once(500, sideStand(), {
    tunic: keys([0, { dy: 0 }], [120, { dy: -2 }], [300, { dy: 0 }]),
    'arm-l': keys([0, { rot: 0 }], [150, { rot: -150 }]),
    'arm-r': keys([0, { rot: 0 }], [150, { rot: -145 }]),
  }),
  reorder: { 'arm-r': 'top' },
};

/** The NPC glance at a pickpocket (§6.8): the same staged glance as the merchant's. */
const glance = glanceClips(P, { windup: 400, look: 1200, back: 600 });

/** Every citizen clip by `PoseId` (and `<clip>@<view>` variants). Keyed by rig only. */
export const clips: Record<string, Clip> = {
  idle,
  'idle@side': loop(2400, sideStand(), breathe(2400, P)),
  walk,
  'walk@side': walkSide,
  browse,
  'browse@side': browseSide,
  pickpocket,
  'pickpocket@side': pickpocketSide,
  throw: throwFront,
  'throw@side': { ...throwSide, reorder: { 'arm-r': 'top' } },
  point: pointFront,
  'point@back': pointBack,
  'point@side': posed(loop(500, sideStand(), pointShake.tracks), 'point'),
  handsUp,
  'handsUp@back': handsUpBack,
  'handsUp@side': handsUpSide,
  run,
  'run@side': runSideClip,
  stocks,
  'stocks@side': stocksSide,
  caught,
  'caught@side': caughtSide,
  ...glance,
};
