// Automaton footman clips (SPEC §2.4): idle, march, a sword slash, thrown and the collapse into scrap.
// The blade rides on `hand` (rig), so the slash turns the hand about its wrist pivot with the body
// leaning in; the side view has no free hand (art note, BUILD_PLAN §8). The slash and the collapse are
// solved per view (`attack@<view>`, `death@<view>`); the collapse fades and wiring drops `scrap-ours`
// 1–2 when it lands (FF9).
import rig from '../../../../art/neon-knights/rigs/footman.json';
import type { Clip, Keyframe, RigDef, ViewId } from '../../../presentation/types';
import {
  each,
  ENEMY_DEATH,
  idleBob,
  loop,
  once,
  perViewClips,
  sin,
  walkerWalk,
  wave,
} from '../clipKit';
import { collapseTracks, landedAt } from '../fall';

const def = rig as unknown as RigDef;

/** Slash (RD9-fix-3): the clip's length and when the blade crosses the aim (the old stab's peak). */
export const SLASH_MS = 300;
export const SLASH_IMPACT_MS = 90;
/** Wind-up (sword raised back) and follow-through keys, either side of the impact. */
export const SLASH_WINDUP_MS = 50;
export const SLASH_FOLLOW_MS = 140;
const RECOVER_MS = 210;

/** rot (degrees), dx, dy of one part at one beat. */
type Beat = readonly [rot: number, dx: number, dy: number];
interface SlashKeys {
  /** The blade hand at wind-up, impact, follow-through and part-way back. */
  hand: readonly [Beat, Beat, Beat, Beat];
  /** The body's lean at wind-up, impact and follow-through. */
  torso: readonly [Beat, Beat, Beat];
  /** The free hand pulls the other way (front and back only). */
  free?: readonly [Beat, Beat, Beat];
}

/**
 * Side: the blade cuts from raised-back, down through the aim (level, forward) at the impact, to low
 * in front. Front and back (aim toward or away from the camera): a cut across the body, the tip
 * crossing his centre line at the impact. About 120° of blade turn in every view (hand plus torso).
 */
const SLASH: Record<ViewId, SlashKeys> = {
  side: {
    hand: [
      [-40, -2, -2],
      [50, 5, 0],
      [70, 4, 1],
      [16, 1, 0],
    ],
    torso: [
      [-4, -1, 0],
      [6, 2, 0],
      [7, 1.5, 0],
    ],
  },
  front: {
    hand: [
      [26, 2, -4],
      [-22, -6, 1],
      [-88, -12, 4],
      [-20, -3, 1],
    ],
    torso: [
      [2, 0, 0],
      [-3, 0, 1],
      [-4, 0, 1],
    ],
    free: [
      [-10, -1, 0],
      [12, 1, 1],
      [14, 1, 1],
    ],
  },
  back: {
    hand: [
      [-26, -2, -4],
      [22, 6, 1],
      [88, 12, 4],
      [20, 3, 1],
    ],
    torso: [
      [-2, 0, 0],
      [3, 0, 1],
      [4, 0, 1],
    ],
    free: [
      [10, 1, 0],
      [-12, -1, 1],
      [-14, -1, 1],
    ],
  },
};

const AT_REST: Beat = [0, 0, 0];
const beats = (b: readonly Beat[], times: readonly number[]): Keyframe[] =>
  [AT_REST, ...b, AT_REST].map(([rot, dx, dy], i) => ({
    t: i === 0 ? 0 : (times[i - 1] ?? SLASH_MS),
    rot,
    dx,
    dy,
  }));

function slash(view: ViewId): Clip {
  const k = SLASH[view];
  const tracks: Record<string, Keyframe[]> = {
    hand: beats(k.hand, [SLASH_WINDUP_MS, SLASH_IMPACT_MS, SLASH_FOLLOW_MS, RECOVER_MS]),
    torso: beats(k.torso, [SLASH_WINDUP_MS, SLASH_IMPACT_MS, SLASH_FOLLOW_MS]),
  };
  if (k.free)
    tracks['hand-free'] = beats(k.free, [SLASH_WINDUP_MS, SLASH_IMPACT_MS, SLASH_FOLLOW_MS]);
  return once(SLASH_MS, tracks);
}

/** Collapse: the parts fall into a pile, lie still, then fade (the enemies' timing, quicker). */
const COLLAPSE = { ...ENEMY_DEATH, hold: 500, fadeMs: 500, seed: 'footman' };
const fadeAt = Math.round(landedAt(COLLAPSE) + COLLAPSE.stagger * 0.5 + COLLAPSE.hold);
const end = fadeAt + COLLAPSE.fadeMs;

/** Thrown by Reinforcements: tucked, the body rocking while it arcs (the arc is code, §2.4). */
const THROWN_MS = 360;
const thrown: Clip = loop(
  THROWN_MS,
  each(
    ['torso', 'helm', 'plume'],
    wave(THROWN_MS, 8, (u) => ({ rot: 16 * sin(u), dy: 5 })),
  ),
  each(['leg-far', 'leg-near', 'leg-l', 'leg-r'], [{ t: 0, dy: -6, sy: 0.72 }]),
  each(['hand', 'hand-free'], [{ t: 0, dy: 4, rot: 24 }]),
);

export const clips: Record<string, Clip> = {
  idle: idleBob(1500, ['torso'], 0.8),
  walk: walkerWalk(
    480,
    ['torso'],
    ['leg-far', 'leg-l'],
    ['leg-near', 'leg-r'],
    18,
    1.5,
    each(
      ['hand', 'hand-free'],
      wave(480, 8, (u) => ({ rot: 8 * sin(u) })),
    ),
  ),
  ...perViewClips(def, 'attack', slash),
  thrown,
  ...perViewClips(def, 'death', (view) =>
    once(end, collapseTracks(def, { ...COLLAPSE, fade: [fadeAt, end] }, view)),
  ),
};
