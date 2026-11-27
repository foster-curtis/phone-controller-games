// Glances aimed at a theft (SPEC §6.6 merchant glance, §6.8 NPC glance at a pickpocket, §12.2;
// TF1-fix-2, user C1 follow-up): from the glancer's body facing and the direction to the thief, the
// steps a rig plays. Wind-up: the head alone turns a quarter turn toward the target (a side head on a
// front/back body, toward the side the target is on; a front head on a side body, never the back of
// the head). Look: body and head together face the target. Then `resolveGlance`: caught → point and
// shout at the target from the look facing; clear → body and head turn back to the original facing,
// and the caller resumes what it was doing. Pure, so tests and the gallery sample it headless.
import type { Vec2 } from '../../content/types';
import { viewForFacing } from './rigMath';
import type {
  Facing4,
  GlanceOutcome,
  GlancePlan,
  GlanceRig,
  GlanceStep,
  RigInstance,
  ViewId,
} from './types';

/** Step timings, ms (tuning; the clips in `clips/kit.ts` `aimedGlanceClips` are authored to them). */
export const GLANCE_MS = { windup: 400, look: 1200, settle: 400 } as const;

/** A target this close to the body's forward axis (|lateral| / |dir|) counts as dead ahead/behind. */
const DEAD_ON = 0.1;

/** Unit forward vector of a facing, in world tiles (y down the screen, SPEC §12.2). */
export const FACING_VEC: Readonly<Record<Facing4, Vec2>> = {
  front: { x: 0, y: 1 },
  back: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** The rig view and mirror that draw a facing (side views face +x unmirrored). */
export function facingView(f: Facing4): { view: ViewId; mirror: boolean } {
  if (f === 'left' || f === 'right') return { view: 'side', mirror: f === 'left' };
  return { view: f, mirror: false };
}

/** The facing a rig's view and mirror show. */
export function facingOf(view: ViewId, mirror: boolean): Facing4 {
  return view === 'side' ? (mirror ? 'left' : 'right') : view;
}

/** The facing for a sim facing in radians (0 = +x, y down), as `RigInstance.face` picks it. */
export function facingForRadians(radians: number): Facing4 {
  const { view, mirror } = viewForFacing(radians);
  return facingOf(view, mirror);
}

/**
 * The facing toward a world direction: the same 4-view rule as `RigInstance.face` (up/down win
 * within ±45°), so a glancer looks at the thief in the view it would show walking to him.
 */
export function facingToward(dir: Vec2): Facing4 {
  // Straight from the vector (no trig round-off): exact diagonals go to the side, as in `face`.
  if (Math.abs(dir.y) > Math.abs(dir.x)) return dir.y < 0 ? 'back' : 'front';
  return dir.x < 0 ? 'left' : 'right';
}

/**
 * The glance from `facing` (a 4-way facing, or the sim's facing in radians) toward `dir` (target −
 * glancer, world tiles). `seed` (e.g. the glancer's entity id) picks the head's side for a target
 * dead ahead or dead behind a front/back body: even → right, odd → left (default right).
 */
export function planGlance(
  rig: GlanceRig,
  facing: Facing4 | number,
  dir: Vec2,
  opts: { seed?: number } = {},
): GlancePlan {
  const from = typeof facing === 'number' ? facingForRadians(facing) : facing;
  const body = facingView(from);
  const toward = facingToward(dir);
  let headSide: 'left' | 'right' | null = null;
  let clip = 'glanceHead';
  if (body.view !== 'side') {
    // Front/back body: a side head toward the target's screen side (world x = screen x).
    const len = Math.hypot(dir.x, dir.y);
    headSide =
      len > 0 && Math.abs(dir.x) > DEAD_ON * len
        ? dir.x < 0
          ? 'left'
          : 'right'
        : (opts.seed ?? 0) % 2 !== 0
          ? 'left'
          : 'right';
    // The unflipped side head faces the rig's +x; a mirrored rig flips the screen side.
    if ((headSide === 'left') !== body.mirror) clip = 'glanceHeadFlip';
  }
  const look = facingView(toward);
  return {
    rig,
    facing: from,
    toward,
    headSide,
    windup: { stage: 'windup', ...body, clip, ms: GLANCE_MS.windup },
    look: { stage: 'look', ...look, clip: 'glanceStare', ms: GLANCE_MS.look },
  };
}

/**
 * How a glance ends: caught → point-and-shout at the target from the look facing (the `point` clip
 * of that view; it loops until the caller moves on, `ms` null); clear → the turn back to the
 * original facing, after which the caller resumes its own clip.
 */
export function resolveGlance(plan: GlancePlan, outcome: GlanceOutcome): GlanceStep[] {
  if (outcome === 'caught')
    return [{ stage: 'point', ...facingView(plan.toward), clip: 'point', ms: null }];
  return [
    { stage: 'turnBack', ...facingView(plan.facing), clip: 'glanceSettle', ms: GLANCE_MS.settle },
  ];
}

/** Every step of a glance in order: wind-up, look, then the outcome's steps. */
export function glanceSteps(plan: GlancePlan, outcome: GlanceOutcome): GlanceStep[] {
  return [plan.windup, plan.look, ...resolveGlance(plan, outcome)];
}

/** Puts a rig into a step: its view and mirror, then the step's clip from the start. */
export function playGlanceStep(rig: RigInstance, step: GlanceStep): void {
  rig.setView(step.view, step.mirror);
  rig.play(step.clip, { restart: true, fadeMs: 0 });
}
