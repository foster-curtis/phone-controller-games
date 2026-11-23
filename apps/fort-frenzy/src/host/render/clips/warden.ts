// Warden clips (SPEC §2.4): heavy, slow cadence with a deeper step; main (ground slam: the hammer
// rises, the gravity coil brightens through the wind-up, the head comes down on the impact; front and
// back views swap to the `slam` group's hammer-down at the impact, RD5), super (jump slam: crouch,
// airborne with the hammer raised, then the landing with the same impact swap, every seam flaring),
// build (kneel and tap the hammer on the plate). Attacks are solved per view (`attack@side`, …): the hammer swings
// forward in side view and toward or away from the camera in front and back views. Impact times are
// the sim's wind-ups (content `windupMs`; src/host/__tests__/speeds.test.ts keeps them equal), so the
// hammer lands when the damage does.
import rig from '../../../../art/neon-knights/rigs/warden.json';
import type { Clip, Keyframe, RigDef, ViewId } from '../../../presentation/types';
import { each, knightClips, once, perViewClips, type KnightParts, type Tracks } from '../clipKit';
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

/** Side view: the hammer's head hits the ground on its short end, under the torso's 8° (art README). */
const SIDE_HAMMER_DOWN = 64;

/** The slam's hammer hits the ground (= content `warden.main.windupMs`). */
export const SLAM_IMPACT_MS = 200;
/** The jump slam lands (= content `warden.super.windupMs`). */
export const JUMP_IMPACT_MS = 1800;
/** Older name of `JUMP_IMPACT_MS` (the TD stomp); kept for the importers that still use it. */
export const STOMP_IMPACT_MS = JUMP_IMPACT_MS;
/** The build kneel's first hammer tap on the plate. */
export const BUILD_TAP_MS = 300;

const SLAM_MS = 600;
/** The whole jump slam reads as about 2 s (RC1): 1.8 s to the landing, then the recover. */
const JUMP_MS = 2200;
/** Torso lift of the jump slam's airborne pose, sprite units (art README "Redesign poses"). */
export const JUMP_LIFT = 34;
/** The upright hammer is hidden from the impact until this long after it (the recover). */
const SLAM_HOLD_MS = 260;
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

/**
 * Hides a part from `on` to `off` (alpha steps, 1 ms ramps) on top of its own keys, so the upright
 * hammer and its glow vanish while hammer-down shows.
 */
function hammerOff(on: number, off: number, keys: Keyframe[]): Keyframe[] {
  return [
    ...keys,
    { t: on - 1, alpha: 1 },
    { t: on, alpha: 0 },
    { t: off - 1, alpha: 0 },
    { t: off, alpha: 1 },
  ].sort((a, b) => a.t - b.t);
}

/**
 * The `slam` group on from `on` to `off`, and hammer-down-glow pulsing with the coil (a track per
 * part: hammer-down carries the switch, its glow the pulse).
 */
function slamGroup(on: number, off: number, coilKeys: Keyframe[]): Tracks {
  return {
    'hammer-down': [
      { t: 0, groups: { slam: false } },
      { t: on, groups: { slam: true } },
      { t: off, groups: { slam: false } },
    ],
    'hammer-down-glow': coilKeys,
  };
}

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
            { t: I, rot: SIDE_HAMMER_DOWN },
            { t: I + 40, rot: SIDE_HAMMER_DOWN },
            { t: I + 120, rot: SIDE_HAMMER_DOWN },
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
          // The upright hammer is hidden at the impact (hammerOff) and the `slam` group's
          // hammer-down shows instead: no negative sy, which flattened the head (RD5).
          hammer: [
            { t: 0, dy: 0, sy: 1 },
            { t: I - 60, dy: -6, sy: 1.08 },
            { t: SLAM_MS, dy: 0, sy: 1 },
          ],
        };
  if (view === 'side') return once(SLAM_MS, body, { 'hammer-glow': coil(I, SLAM_MS) });
  return once(
    SLAM_MS,
    body,
    { 'hammer-glow': hammerOff(I, I + SLAM_HOLD_MS, coil(I, SLAM_MS)) },
    { hammer: hammerOff(I, I + SLAM_HOLD_MS, body.hammer!) },
    slamGroup(I, I + SLAM_HOLD_MS, coil(I, SLAM_MS)),
  );
}

const S = JUMP_IMPACT_MS;
/** Jump slam beats: crouch done, airborne peak reached, still up, then the landing at S. */
export const JUMP_CROUCH_MS = 420;
const J_CROUCH = JUMP_CROUCH_MS;
const J_UP = 1000;
const J_HANG = S - 120;
/** Crouch: the legs shorten to 0.74 and the torso drops with them (art README "Redesign poses"). */
const CROUCH_SY = 0.74;
const CROUCH_DROP = 11;
/**
 * Jump slam (the Warden's super, art README "Redesign poses"): crouch, airborne with the torso up
 * 34 units and the hammer raised (the shadow stays on the ground: code), then the landing hits with
 * the main slam's impact pose; the front and back views swap to the `slam` group's hammer-down.
 */
function jump(view: ViewId): Clip {
  const flare = each(
    GLOWS,
    pulse([
      [0, 1],
      [J_UP, 1.4],
      [S, 3.2],
      [JUMP_MS, 1],
    ]),
  );
  const torso: Keyframe[] = [
    { t: 0, dy: 0, sy: 1, rot: 0 },
    { t: J_CROUCH, dy: CROUCH_DROP, sy: 1, rot: view === 'side' ? 2 : 0 },
    { t: J_UP, dy: -JUMP_LIFT, sy: 1.02, rot: view === 'side' ? -4 : 0 },
    { t: J_HANG, dy: -JUMP_LIFT, sy: 1.02, rot: view === 'side' ? -4 : 0 },
    { t: S, dy: 3, sy: 0.96, rot: view === 'side' ? 8 : 0 },
    { t: S + 120, dy: 3, sy: 0.96, rot: view === 'side' ? 8 : 0 },
    { t: JUMP_MS, dy: 0, sy: 1, rot: 0 },
  ];
  // The legs: shortened in the crouch, dangling at full length in the air, planted on the landing.
  const legKeys = (down: number): Keyframe[] => [
    { t: 0, sy: 1 },
    { t: J_CROUCH, sy: CROUCH_SY },
    { t: J_UP, sy: 1 },
    { t: S, sy: down },
    { t: JUMP_MS, sy: 1 },
  ];
  const hammerUp = (rest: number, up: number, down: number): Keyframe[] => [
    { t: 0, ...(view === 'side' ? { rot: rest } : { dy: rest }) },
    { t: J_UP, ...(view === 'side' ? { rot: up } : { dy: up }) },
    { t: J_HANG, ...(view === 'side' ? { rot: up } : { dy: up }) },
    { t: S, ...(view === 'side' ? { rot: down } : { dy: down }) },
    { t: JUMP_MS, ...(view === 'side' ? { rot: rest } : { dy: rest }) },
  ];
  const raise = (up: number, down: number): Keyframe[] => [
    { t: 0, dy: 0 },
    { t: J_UP, dy: up },
    { t: J_HANG, dy: up },
    { t: S, dy: down },
    { t: S + 120, dy: down },
    { t: JUMP_MS, dy: 0 },
  ];
  if (view === 'side') {
    return once(
      JUMP_MS,
      {
        torso,
        frontleg: legKeys(1),
        backleg: legKeys(1),
        // The head goes up over his shoulder in the air, then lands on its short end (rot 64).
        hammer: [...hammerUp(0, -42, SIDE_HAMMER_DOWN), { t: S + 120, rot: SIDE_HAMMER_DOWN }].sort(
          (x, y) => x.t - y.t,
        ),
        gauntlet: raise(-12, 2),
      },
      flare,
    );
  }
  const legs = [half('legs', 'l', view), half('legs', 'r', view)];
  const legGlows = [half('legs-glow', 'l', view), half('legs-glow', 'r', view)];
  return once(
    JUMP_MS,
    { torso },
    each([...legs, ...legGlows], legKeys(1)),
    { gauntlets: raise(-10, 6) },
    { hammer: hammerOff(S, S + SLAM_HOLD_MS, hammerUp(0, -6, 4)) },
    flare,
    { 'hammer-glow': hammerOff(S, S + SLAM_HOLD_MS, coil(S, JUMP_MS)) },
    slamGroup(S, S + SLAM_HOLD_MS, coil(S, JUMP_MS)),
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
  ...perViewClips(def, 'super', jump),
  ...perViewClips(def, 'build', build),
};
