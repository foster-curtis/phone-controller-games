// Guard clips (SPEC §6.12, §6.13, §6.21, §12.2): idle, patrol walk, jog (chase), catch and the march
// to the stocks. ART_NOTES: guards walk and jog in the side view; front and back get the same gaits.
// TF1-fix-1 (user C1 note 2): the scutum is parented to the shield arm in the rig (his left: front
// `arm-r`, side `arm-l` behind it, back `arm-l`), so the shield moves only with that arm; gaits give
// that arm a small bounce instead of a swing, and grabs, the march hold and the jog's pump use the
// other (sword) arm in every view.
import type { Clip, ViewId } from '../types';
import {
  breathe,
  gaitFront,
  gaitSide,
  hold,
  keys,
  loop,
  once,
  runFront,
  runSide,
  sideStand,
  sin,
  wave,
  type GaitParts,
  type Tracks,
} from './kit';

const P: GaitParts = { root: 'cuirass', head: 'head' };
const PATROL_MS = 1100;
const JOG_MS = 600;
const MARCH_MS = 800;

/** The arm that carries the scutum, per view (viewer-relative part names). */
export const SHIELD_ARM: Readonly<Record<ViewId, 'arm-l' | 'arm-r'>> = {
  front: 'arm-r',
  side: 'arm-l',
  back: 'arm-l',
};
/** The free (sword-hand) arm, per view. */
export const FREE_ARM: Readonly<Record<ViewId, 'arm-l' | 'arm-r'>> = {
  front: 'arm-l',
  side: 'arm-r',
  back: 'arm-r',
};

/** The shield arm's little bounce: it rides the step a beat late and barely turns. */
const bounce = (ms: number, amp: number, view: ViewId): Tracks => ({
  [SHIELD_ARM[view]]: wave(ms, 12, (u) => ({
    rot: 1.5 * sin(u),
    dy: amp * Math.abs(sin(u, -0.08)),
  })),
});

/** The grab: lunge and reach for the thief with the free arm. */
const catchFront = once(500, {
  'arm-l': keys([0, { rot: 0 }], [200, { rot: 110 }], [500, { rot: 90 }]),
  cuirass: keys([0, { dy: 0 }], [200, { dy: 1 }], [500, { dy: 0.5 }]),
});
// Back: the free arm (his right, viewer's right) reaches away from the camera, up and shortened.
const catchBack = once(500, {
  'arm-r': keys(
    [0, { rot: 0, sy: 1 }],
    [200, { rot: -150, sy: 0.7 }],
    [500, { rot: -140, sy: 0.75 }],
  ),
  cuirass: keys([0, { dy: 0 }], [200, { dy: -0.6 }], [500, { dy: -0.3 }]),
});
const catchSide: Clip = {
  ...once(500, sideStand(), {
    'arm-r': keys([0, { rot: 0 }], [200, { rot: -100 }], [500, { rot: -85 }]),
    cuirass: keys([0, { rot: 0, dx: 0 }], [200, { rot: 6, dx: 1.5 }], [500, { rot: 3, dx: 1 }]),
  }),
  reorder: { 'arm-r': 'top' },
};

/** March: a stiff, high step, the free hand out holding the thief (§6.13). */
const march = (view: ViewId, hand: number): Clip =>
  loop(
    MARCH_MS,
    view === 'side'
      ? gaitSide(MARCH_MS, P, { legs: 20, arms: 0, bob: 0.4 })
      : gaitFront(MARCH_MS, P, { legs: 24, arms: 0, bob: 0.4 }),
    bounce(MARCH_MS, 0.3, view),
    { [FREE_ARM[view]]: hold({ rot: hand }) },
  );

const patrol = (view: ViewId): Clip =>
  loop(
    PATROL_MS,
    view === 'side'
      ? gaitSide(PATROL_MS, P, { legs: 12, arms: 12, bob: 0.4 })
      : gaitFront(PATROL_MS, P, { legs: 14, arms: 8, bob: 0.4 }),
    bounce(PATROL_MS, 0.3, view),
  );

/** Jog (chase, §6.12; user C1 note 3): the run cycle, the sword arm pumping, the shield bouncing. */
const jog = (view: ViewId): Clip =>
  loop(
    JOG_MS,
    view === 'side'
      ? runSide(JOG_MS, P, { legs: 22, arms: 28, bob: 0.9, lean: 5, tuck: 0.2 })
      : runFront(JOG_MS, P, { legs: 22, arms: 0.2, bob: 1, lean: 5, tuck: 0.2 }),
    bounce(JOG_MS, 0.6, view),
  );

export const clips: Record<string, Clip> = {
  idle: loop(3000, breathe(3000, P, 0.4)),
  'idle@side': loop(3000, sideStand(), breathe(3000, P, 0.4)),
  patrol: patrol('front'),
  'patrol@back': patrol('back'),
  'patrol@side': patrol('side'),
  jog: jog('front'),
  'jog@back': jog('back'),
  'jog@side': jog('side'),
  catch: catchFront,
  'catch@back': catchBack,
  'catch@side': catchSide,
  march: march('front', 35),
  'march@back': march('back', -35),
  'march@side': march('side', -60),
};
