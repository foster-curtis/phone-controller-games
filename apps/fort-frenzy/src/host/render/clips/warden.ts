// Warden clips (SPEC §2.4): heavy, slow cadence with a deeper step; main (ground slam: the hammer
// rises, the gravity coil brightens through the wind-up, the head comes down on the impact), super
// (stomp: the leg lifts and drives down, every seam flares with the shockwave), build (kneel and tap
// the hammer on the plate). Attacks are solved per view (`attack@side`, …): the hammer swings
// forward in side view and toward or away from the camera in front and back views. Impact times are
// the sim's wind-ups (content `windupMs`; src/host/__tests__/speeds.test.ts keeps them equal), so the
// hammer lands when the damage does. Mason's sparks are effects (scene/structuresView.ts).
import rig from '../../../../art/neon-knights/rigs/warden.json';
import type { Clip, Keyframe, RigDef, ViewId } from '../../../themes/types';
import { each, knightClips, once, perViewClips, type KnightParts } from '../clipKit';
import { half } from '../split';

const def = rig as unknown as RigDef;

const parts: KnightParts = {
  root: 'torso',
  legBack: ['backleg'],
  legFront: ['frontleg'],
  arms: ['gauntlet'],
  glows: [
    'torso-glow',
    'frontleg-glow',
    'helm-glow',
    'frontpaul-glow',
    'hammer-glow',
    'legs-glow',
    'pauls-glow',
  ],
  all: [
    'backpaul',
    'backleg',
    'torso',
    'frontleg',
    'helm',
    'plume',
    'frontpaul',
    'hammer',
    'gauntlet',
    'legs',
    'pauls',
    'gauntlets',
  ],
};

/** The slam's hammer hits the ground (= content `warden.main.windupMs`). */
export const SLAM_IMPACT_MS = 200;
/** The stomp's foot hits the ground (= content `warden.super.windupMs`). */
export const STOMP_IMPACT_MS = 320;
/** The build kneel's first hammer tap on the plate: wiring starts the structure's sketch here. */
export const BUILD_TAP_MS = 300;

const SLAM_MS = 600;
const STOMP_MS = 760;
const BUILD_MS = 760;

/** Every glow piece, the split leg halves included. */
const GLOWS = [
  ...parts.glows.filter((g) => g !== 'legs-glow'),
  half('legs-glow', 'l', 'front'),
  half('legs-glow', 'r', 'front'),
  half('legs-glow', 'l', 'back'),
  half('legs-glow', 'r', 'back'),
];

const pulse = (keys: [number, number][]): Keyframe[] => keys.map(([t, glow]) => ({ t, glow }));

/** The gravity coil brightens through the wind-up and flares on the impact. */
const coil = (impact: number, end: number) =>
  pulse([
    [0, 1],
    [impact - 40, 2.4],
    [impact, 3.2],
    [end, 1],
  ]);

const I = SLAM_IMPACT_MS;
function slam(view: ViewId): Clip {
  const body: Record<string, Keyframe[]> =
    view === 'side'
      ? {
          // Leans back as the hammer goes up over his shoulder, then drives forward into the slam.
          torso: [
            { t: 0, rot: 0, dy: 0 },
            { t: I - 60, rot: -5, dy: -1 },
            { t: I, rot: 8, dy: 2 },
            { t: I + 120, rot: 7, dy: 2 },
            { t: SLAM_MS, rot: 0, dy: 0 },
          ],
          gauntlet: [
            { t: 0, dx: 0, dy: 0 },
            { t: I - 60, dx: -3, dy: -12 },
            { t: I, dx: 6, dy: 2 },
            { t: I + 120, dx: 6, dy: 2 },
            { t: SLAM_MS, dx: 0, dy: 0 },
          ],
          // The head swings from behind the helm to the ground in front of him.
          hammer: [
            { t: 0, rot: 0 },
            { t: I - 60, rot: -42 },
            { t: I, rot: 100 },
            { t: I + 40, rot: 96 },
            { t: I + 120, rot: 98 },
            { t: SLAM_MS, rot: 0 },
          ],
          frontpaul: [
            { t: 0, rot: 0 },
            { t: I - 60, rot: -8 },
            { t: I, rot: 5 },
            { t: SLAM_MS, rot: 0 },
          ],
        }
      : {
          // Front and back: the hammer rises, then swings over toward (front) or away from (back)
          // the camera: its height flips through zero to point down at the ground, foreshortened.
          torso: [
            { t: 0, dy: 0, sy: 1 },
            { t: I - 60, dy: -2, sy: 1.02 },
            { t: I, dy: 3, sy: 0.96 },
            { t: I + 120, dy: 3, sy: 0.96 },
            { t: SLAM_MS, dy: 0, sy: 1 },
          ],
          gauntlets: [
            { t: 0, dy: 0 },
            { t: I - 60, dy: -10 },
            { t: I, dy: 6 },
            { t: I + 120, dy: 6 },
            { t: SLAM_MS, dy: 0 },
          ],
          hammer: [
            { t: 0, dy: 0, sy: 1 },
            { t: I - 60, dy: -6, sy: 1.08 },
            { t: I, dy: 4, sy: view === 'front' ? -0.55 : -0.4 },
            { t: I + 120, dy: 4, sy: view === 'front' ? -0.5 : -0.4 },
            { t: SLAM_MS, dy: 0, sy: 1 },
          ],
        };
  return once(SLAM_MS, body, { 'hammer-glow': coil(I, SLAM_MS) });
}

const S = STOMP_IMPACT_MS;
function stomp(view: ViewId): Clip {
  const flare = each(
    GLOWS,
    pulse([
      [0, 1],
      [S - 80, 1.6],
      [S, 3.2],
      [STOMP_MS, 1],
    ]),
  );
  const torso: Keyframe[] = [
    { t: 0, dy: 0, sy: 1, rot: 0 },
    { t: S - 100, dy: -6, sy: 1.03, rot: view === 'side' ? -4 : 0 },
    { t: S, dy: 5, sy: 0.93, rot: view === 'side' ? 3 : 0 },
    { t: S + 160, dy: 3, sy: 0.96, rot: view === 'side' ? 2 : 0 },
    { t: STOMP_MS, dy: 0, sy: 1, rot: 0 },
  ];
  if (view === 'side') {
    return once(
      STOMP_MS,
      {
        torso,
        // The near leg lifts high and forward, then drives down flat.
        frontleg: [
          { t: 0, rot: 0, sy: 1 },
          { t: S - 100, rot: -38, sy: 0.82 },
          { t: S, rot: 0, sy: 1 },
          { t: STOMP_MS, rot: 0, sy: 1 },
        ],
        backleg: [
          { t: 0, rot: 0 },
          { t: S - 100, rot: 6 },
          { t: S, rot: 0 },
        ],
        // The hammer comes up for balance and drops with the foot.
        hammer: [
          { t: 0, rot: 0 },
          { t: S - 100, rot: -24 },
          { t: S, rot: 14 },
          { t: STOMP_MS, rot: 0 },
        ],
        gauntlet: [
          { t: 0, dy: 0 },
          { t: S - 100, dy: -8 },
          { t: S, dy: 2 },
          { t: STOMP_MS, dy: 0 },
        ],
      },
      flare,
    );
  }
  const lift = [half('legs', 'l', view), half('legs-glow', 'l', view)];
  return once(
    STOMP_MS,
    { torso },
    each(lift, [
      { t: 0, dy: 0, sy: 1 },
      { t: S - 100, dy: -14, sy: 0.8 },
      { t: S, dy: 1, sy: 1.04 },
      { t: STOMP_MS, dy: 0, sy: 1 },
    ]),
    {
      gauntlets: [
        { t: 0, dy: 0 },
        { t: S - 100, dy: -8 },
        { t: S, dy: 4 },
        { t: STOMP_MS, dy: 0 },
      ],
    },
    flare,
  );
}

const B = BUILD_TAP_MS;
/** Two taps of the hammer on the plate while kneeling. */
const taps = (down: number, up: number): [number, number][] => [
  [0, 0],
  [200, up],
  [B, down],
  [B + 80, up],
  [B + 180, down],
  [560, up * 0.5],
  [BUILD_MS, 0],
];
function build(view: ViewId): Clip {
  const kneel = (v: number): Keyframe[] => [
    { t: 0, rot: 0, sy: 1 },
    { t: 200, rot: v, sy: 0.9 },
    { t: 560, rot: v, sy: 0.9 },
    { t: BUILD_MS, rot: 0, sy: 1 },
  ];
  const halfKneel = (sy: number, dy: number): Keyframe[] => [
    { t: 0, sy: 1, dy: 0 },
    { t: 200, sy, dy },
    { t: 560, sy, dy },
    { t: BUILD_MS, sy: 1, dy: 0 },
  ];
  const torso: Keyframe[] = [
    { t: 0, dy: 0, rot: 0 },
    { t: 200, dy: 12, rot: view === 'side' ? 6 : 0 },
    { t: 560, dy: 12, rot: view === 'side' ? 6 : 0 },
    { t: BUILD_MS, dy: 0, rot: 0 },
  ];
  const glow = {
    'hammer-glow': pulse([
      [0, 1],
      [B, 2.6],
      [B + 80, 1.6],
      [B + 180, 2.6],
      [BUILD_MS, 1],
    ]),
  };
  if (view === 'side') {
    return once(
      BUILD_MS,
      {
        torso,
        frontleg: kneel(-35),
        backleg: kneel(30),
        hammer: taps(62, 40).map(([t, rot]) => ({ t, rot })),
        gauntlet: taps(4, 0).map(([t, dy]) => ({ t, dy })),
      },
      glow,
    );
  }
  return once(
    BUILD_MS,
    {
      torso,
      [half('legs', 'l', 'front')]: halfKneel(0.72, 2),
      [half('legs', 'r', 'front')]: halfKneel(0.86, 0),
      [half('legs', 'l', 'back')]: halfKneel(0.86, 0),
      [half('legs', 'r', 'back')]: halfKneel(0.72, 2),
      hammer: taps(view === 'front' ? -0.35 : -0.25, 0.6).map(([t, v]) => ({
        t,
        sy: v === 0 ? 1 : v,
      })),
      gauntlets: taps(6, 2).map(([t, dy]) => ({ t, dy })),
    },
    glow,
  );
}

export const clips: Record<string, Clip> = {
  ...knightClips(def, parts, 760, 14, 3.2),
  ...perViewClips(def, 'attack', slam),
  ...perViewClips(def, 'super', stomp),
  ...perViewClips(def, 'build', build),
};
