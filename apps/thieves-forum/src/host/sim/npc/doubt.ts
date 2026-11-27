// Shoppers who aren't sure of themselves (SPEC §6.10 techniques 2, 3 and 5; TF2-fix-1 from the C1
// note that NPCs were "much more confident" than players): hesitation stops that look left and right,
// changes of mind (turn right round and walk back a few steps, or pick a different target), slowing and
// drifting toward stalls they pass (sometimes stopping), and a low-frequency heading drift instead of a
// straight line to the goal. All seeded from the NPC's own stream and scaled by its `doubt` roll, so the
// crowd isn't uniform and a player's natural hesitation looks like everyone else's (SPEC §6.11).
import type { Rng } from '@pcg/game-kit';
import type { Content, StallId } from '../../../content/types';
import { angleDiff } from '../geometry';
import { clearPath, counterPoint, navGraph } from '../nav';
import type { StepContext } from '../systems';
import { TUNING } from '../tuning';
import type { Character } from '../types';
import { SIM_HZ, STEP_MS } from '../types';

const D = TUNING.doubt;
const DT = STEP_MS / 1000;

const between = (rng: Rng, [lo, hi]: readonly [number, number]) => lo + (hi - lo) * rng.next();

/** A `[lo, hi]` tuning range at this shopper's doubt. */
export const mix = ([lo, hi]: readonly [number, number], doubt: number): number =>
  lo + (hi - lo) * doubt;

/** A per-minute rate as a per-tick chance. */
const perTick = (perMin: number): number => perMin / (60 * SIM_HZ);

/** Starts `n` look-left/right head turns while standing (then a look back ahead), the first now-ish. */
export function startLooks(ctx: StepContext, c: Character, rng: Rng, n: number): void {
  const nav = c.npc.nav!;
  nav.lookBase = c.facing;
  nav.looks = n + 1; // n turns away, then one back to the way it was heading
  nav.faceTo = null;
  nav.lookAt = ctx.world.tick + ctx.ticks(between(rng, [50, 150]));
}

/** Pause-before-choosing (technique 5) sometimes looks around too. */
export function maybeLookAround(ctx: StepContext, c: Character, rng: Rng): void {
  if (rng.next() < D.pauseLooks) startLooks(ctx, c, rng, 1 + (rng.next() < 0.5 ? 1 : 0));
}

/** Called while standing: turn the head and body toward where it is looking (no snapping). */
export function standLook(ctx: StepContext, c: Character, rng: Rng): void {
  const nav = c.npc.nav!;
  const t = ctx.world.tick;
  if (nav.looks > 0 && t >= nav.lookAt) {
    nav.looks--;
    if (nav.looks === 0 && nav.moment !== 'reverse') nav.faceTo = nav.lookBase;
    else {
      // Alternate sides: left, right, left… off the way it was heading.
      const prev = nav.faceTo === null ? 0 : angleDiff(nav.faceTo, nav.lookBase);
      const side = prev === 0 ? (rng.next() < 0.5 ? -1 : 1) : -Math.sign(prev);
      nav.faceTo = nav.lookBase + side * between(rng, D.lookTurn);
    }
    nav.lookAt = t + ctx.ticks(between(rng, D.lookMs));
  }
  if (nav.faceTo === null) return;
  const d = angleDiff(nav.faceTo, c.facing);
  const step = D.turnRate * DT;
  c.facing = Math.abs(d) <= step ? nav.faceTo : c.facing + Math.sign(d) * step;
}

/** Clears looking and the moment once it walks again. */
export function endStand(c: Character): void {
  const nav = c.npc.nav!;
  nav.faceTo = null;
  nav.looks = 0;
  if (nav.moment === 'hesitate' || nav.moment === 'stallStop' || nav.moment === 'retarget')
    nav.moment = 'none';
}

function stopFor(ctx: StepContext, c: Character, ms: number): void {
  c.npc.nav!.pauseUntil = ctx.world.tick + ctx.ticks(ms);
}

/**
 * While walking a stall or roam leg: maybe stop and look around, or change its mind. Returns true when
 * it did (the caller skips the rest of this tick's leg logic).
 */
export function hesitate(ctx: StepContext, c: Character, rng: Rng): boolean {
  const n = c.npc;
  const nav = n.nav!;
  if (c.vx * c.vx + c.vy * c.vy < 0.5) return false;
  // Never stop or turn round in an alley or its mouth: that's how they jam (TF2-fix-1).
  if (nearAlley(ctx, c)) return false;
  if (rng.next() < perTick(mix(D.stopPerMin, nav.doubt))) {
    const ms = between(rng, D.stopMs);
    if (rng.next() < D.stopTurn && reverse(ctx, c, rng, ms)) return true;
    nav.moment = 'hesitate';
    stopFor(ctx, c, ms);
    startLooks(ctx, c, rng, rng.int(D.looks[0], D.looks[1]));
    return true;
  }
  if (rng.next() < perTick(mix(D.mindPerMin, nav.doubt))) {
    if (rng.next() < D.reverse && reverse(ctx, c, rng, 0)) return true;
    retarget(ctx, c, rng);
    return true;
  }
  return false;
}

/**
 * Turns right round (a short stop while it turns, plus `standMs` stood first), then walks a few steps
 * back the way it came.
 */
function reverse(ctx: StepContext, c: Character, rng: Rng, standMs: number): boolean {
  const nav = c.npc.nav!;
  const sp = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
  const g = graphOf(ctx.content);
  const len = between(rng, D.reverseDist);
  const bx = g.bounds;
  const back = {
    x: Math.max(bx.x0 + 0.5, Math.min(bx.x1 - 0.5, c.x - (c.vx / sp) * len)),
    y: Math.max(bx.y0 + 0.5, Math.min(bx.y1 - 0.5, c.y - (c.vy / sp) * len)),
  };
  if (!clearPath(g, c, back)) return false;
  nav.leg = 'back';
  nav.path = [back];
  nav.look = null;
  nav.moment = 'reverse';
  stopFor(ctx, c, standMs + between(rng, D.reverseTurnMs));
  nav.looks = 0;
  nav.lookBase = c.facing;
  nav.faceTo = Math.atan2(back.y - c.y, back.x - c.x);
  return true;
}

/**
 * Stops and picks again: the next two wish-list stops swapped (then a fresh choice), or a few steps
 * off somewhere to the side or behind before going on (an aside leg, like a reversal).
 */
function retarget(ctx: StepContext, c: Character, rng: Rng): void {
  const n = c.npc;
  const nav = n.nav!;
  nav.look = null;
  nav.moment = 'retarget';
  stopFor(ctx, c, between(rng, D.reverseTurnMs) + 200);
  if (n.wishList.length > 1 && rng.next() < D.swap) {
    const [a, b] = n.wishList;
    n.wishList[0] = b!;
    n.wishList[1] = a!;
    nav.leg = 'none';
    nav.path = [];
    startLooks(ctx, c, rng, 1);
    return;
  }
  const g = graphOf(ctx.content);
  const h = Math.atan2(c.vy, c.vx) + (rng.next() < 0.5 ? -1 : 1) * between(rng, D.asideTurn);
  const len = between(rng, D.asideDist);
  const bx = g.bounds;
  const to = {
    x: Math.max(bx.x0 + 0.5, Math.min(bx.x1 - 0.5, c.x + Math.cos(h) * len)),
    y: Math.max(bx.y0 + 0.5, Math.min(bx.y1 - 0.5, c.y + Math.sin(h) * len)),
  };
  if (clearPath(g, c, to)) {
    nav.leg = 'back';
    nav.path = [to];
    nav.looks = 0;
    nav.lookBase = c.facing;
    nav.faceTo = h;
  } else startLooks(ctx, c, rng, 1);
}

/**
 * Technique 3 for everyone (not only the distractible): passing an open stall, maybe slow down and
 * drift toward it with a look, and sometimes stop facing it for a moment. Returns true if it reacted.
 */
export function passStall(ctx: StepContext, c: Character, stall: StallId, rng: Rng): boolean {
  const nav = c.npc.nav!;
  if (rng.next() >= mix(D.stallSlow, nav.doubt)) return false;
  const t = ctx.world.tick;
  nav.slow = between(rng, D.stallFactor);
  nav.look = stall;
  nav.slowUntil = t + ctx.ticks(between(rng, D.stallMs));
  nav.moment = 'stallSlow';
  if (rng.next() < D.stallStop) {
    nav.moment = 'stallStop';
    stopFor(ctx, c, between(rng, D.stallStopMs));
    const p = counterPoint(ctx.content.layout, stall);
    nav.looks = 0;
    nav.lookBase = c.facing;
    nav.faceTo = Math.atan2(p.y - c.y, p.x - c.x);
  }
  return true;
}

/**
 * Technique 2 drift: the heading offset (radians) to add to the seek direction this tick, eased toward
 * a target re-aimed every few seconds, faded out near the waypoint `d` tiles away.
 */
export function driftAngle(ctx: StepContext, c: Character, rng: Rng, d: number): number {
  const nav = c.npc.nav!;
  const t = ctx.world.tick;
  if (t >= nav.driftAt) {
    nav.driftTo = (rng.next() * 2 - 1) * mix(D.drift, nav.doubt);
    nav.driftAt = t + ctx.ticks(between(rng, D.driftMs));
  }
  nav.drift += (nav.driftTo - nav.drift) * Math.min(1, D.driftEase * DT);
  return nav.drift * Math.min(1, d / D.driftFade);
}

/** In an alley or close to one of its mouths (no stopping or turning round there). */
export function nearAlley(ctx: StepContext, c: Character): boolean {
  for (const { rect: r } of ctx.content.layout.alleys)
    if (
      c.x >= r.x - 0.6 &&
      c.x <= r.x + r.w + 0.6 &&
      c.y >= r.y - TUNING.alley.zone &&
      c.y <= r.y + r.h + TUNING.alley.zone
    )
      return true;
  return false;
}

function graphOf(content: Content) {
  return navGraph(content.layout, content.balance.movement.bodyRadius);
}
