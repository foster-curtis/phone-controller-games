// One way at a time through the alleys (SPEC §6.3 "one person wide", §6.10 technique 2; TF2-fix-1
// from the C1 note about NPCs jammed head-on in an alley). Traffic is counted per alley and direction
// from every citizen alike, player or NPC, from position and velocity only (SPEC §6.11: an oncoming
// player counts exactly like an oncoming NPC). An NPC about to enter against oncoming traffic mostly
// goes round (the other alley or an end passage) and otherwise waits beside the mouth, out of the way,
// until the alley clears or it runs out of patience and goes round too.
import type { Rng } from '@pcg/game-kit';
import type { Rect, Vec2 } from '../../../content/types';
import { segmentHitsRect } from '../geometry';
import { clearPath, findPath, navGraph, type NavGraph } from '../nav';
import type { StepContext } from '../systems';
import { TUNING } from '../tuning';
import type { Character, World } from '../types';
import { startLooks } from './doubt';

const A = TUNING.alley;

/** A citizen in or about to enter an alley: which way it goes (0 = standing inside). */
interface Mover {
  id: number;
  dir: number;
  inside: boolean;
  /** Distance outside the rect along y (0 inside). */
  gap: number;
}

let trafficTick = -1;
let trafficWorld: World | null = null;
let traffic: Mover[][] = [];

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** Per alley, everyone in it or about to step in (recomputed once per step). */
export function alleyTraffic(ctx: StepContext): Mover[][] {
  const { world } = ctx;
  if (trafficTick === world.tick && trafficWorld === world) return traffic;
  trafficTick = world.tick;
  trafficWorld = world;
  traffic = ctx.content.layout.alleys.map(({ rect: r }) => {
    const out: Mover[] = [];
    for (const c of world.characters) {
      if (c.x < r.x - 0.5 || c.x > r.x + r.w + 0.5) continue;
      const dir = Math.abs(c.vy) > A.moving ? Math.sign(c.vy) : 0;
      if (inside(r, c.x, c.y)) {
        out.push({ id: c.id, dir, inside: true, gap: 0 });
        continue;
      }
      const above = r.y - c.y;
      const below = c.y - (r.y + r.h);
      // Outside: traffic only when close to a mouth and walking into it.
      if (above > 0 && above <= A.zone && dir > 0)
        out.push({ id: c.id, dir, inside: false, gap: above });
      else if (below > 0 && below <= A.zone && dir < 0)
        out.push({ id: c.id, dir, inside: false, gap: below });
    }
    return out;
  });
  return traffic;
}

/**
 * Is anyone coming the other way (or standing in it) for `c` going `dir` from `gap` out, or is it
 * already full of followers?
 */
function oncoming(ctx: StepContext, ai: number, c: Character, dir: number, gap: number): boolean {
  let followers = 0;
  for (const m of alleyTraffic(ctx)[ai]!) {
    if (m.id === c.id) continue;
    if (m.inside) {
      if (m.dir !== dir) return true;
      followers++;
    } else if (m.dir === -dir && (m.gap < gap || (m.gap === gap && m.id < c.id))) return true;
  }
  return followers >= A.maxIn;
}

function graphOf(ctx: StepContext): NavGraph {
  return navGraph(ctx.content.layout, ctx.content.balance.movement.bodyRadius);
}

/** A re-path that keeps out of the alley this leg avoids. */
export function repath(ctx: StepContext, c: Character, to: Vec2): Vec2[] {
  const nav = c.npc.nav!;
  const avoid = nav.avoid >= 0 ? ctx.content.layout.alleys[nav.avoid]!.rect : undefined;
  return findPath(graphOf(ctx), c, to, avoid);
}

/** Goes round alley `ai`: the same destination by another way. False if there is none. */
function goRound(ctx: StepContext, c: Character, ai: number, path: Vec2[]): boolean {
  const nav = c.npc.nav!;
  const r = ctx.content.layout.alleys[ai]!.rect;
  // An exit walks off the map past its entry point: route to the last on-map waypoint.
  const tail = nav.leg === 'exit' && path.length >= 2 ? path.slice(-1) : [];
  const end = path[path.length - 1 - tail.length]!;
  const g = graphOf(ctx);
  const p = findPath(g, c, end, r);
  // findPath falls back to [end]; that's only a real way round if the straight line is open.
  if (p.length === 1 && (segmentHitsRect(c.x, c.y, end.x, end.y, r) || !clearPath(g, c, end)))
    return false;
  nav.path = [...p, ...tail];
  nav.avoid = ai;
  nav.moment = 'alleyReroute';
  return true;
}

/**
 * Called while walking: about to enter an alley with oncoming traffic → go round or wait beside the
 * mouth. Returns true if it changed course this tick.
 */
export function alleyGate(ctx: StepContext, c: Character, rng: Rng): boolean {
  const nav = c.npc.nav!;
  if (nav.alley >= 0 || nav.path.length === 0) return false;
  const alleys = ctx.content.layout.alleys;
  for (let ai = 0; ai < alleys.length; ai++) {
    const r = alleys[ai]!.rect;
    if (c.x < r.x - A.decide || c.x > r.x + r.w + A.decide) continue;
    if (inside(r, c.x, c.y)) return false;
    const dir = c.y < r.y ? 1 : -1;
    const gap = dir > 0 ? r.y - c.y : c.y - (r.y + r.h);
    if (gap > A.decide) continue;
    // Does the way ahead go through this alley?
    const p0 = nav.path[0]!;
    const p1 = nav.path[1];
    const through =
      segmentHitsRect(c.x, c.y, p0.x, p0.y, r) ||
      (p1 !== undefined && segmentHitsRect(p0.x, p0.y, p1.x, p1.y, r)) ||
      inside(r, p0.x, p0.y);
    if (!through || !oncoming(ctx, ai, c, dir, gap)) continue;
    if (rng.next() < A.reroute && goRound(ctx, c, ai, nav.path)) return true;
    // Wait beside the mouth, on its own side, out of the way.
    const cx = r.x + r.w / 2;
    const side = c.x < cx ? -1 : 1;
    nav.held = nav.path;
    nav.path = [
      {
        x: cx + side * (r.w / 2 + A.waitSide),
        y: dir > 0 ? r.y - A.waitOut : r.y + r.h + A.waitOut,
      },
    ];
    nav.alley = ai;
    nav.alleyDir = dir;
    nav.alleyUntil = ctx.world.tick + ctx.ticks(A.waitMs);
    nav.moment = 'alleyWait';
    return true;
  }
  return false;
}

/**
 * While waiting beside an alley (runs instead of the state machine): go in once it's clear, or go
 * round after the longest wait; look about while standing.
 */
export function alleyWaitStep(ctx: StepContext, c: Character, rng: Rng): void {
  const nav = c.npc.nav!;
  const r = ctx.content.layout.alleys[nav.alley]!.rect;
  const gap = nav.alleyDir > 0 ? r.y - c.y : c.y - (r.y + r.h);
  const held = nav.held;
  if (!oncoming(ctx, nav.alley, c, nav.alleyDir, Math.max(0, gap))) {
    nav.alley = -1;
    nav.held = [];
    nav.moment = 'none';
    nav.path = [...findPath(graphOf(ctx), c, held[0]!), ...held.slice(1)];
    return;
  }
  if (ctx.world.tick >= nav.alleyUntil) {
    const ai = nav.alley;
    nav.alley = -1;
    nav.held = [];
    if (!goRound(ctx, c, ai, held)) {
      nav.path = held;
      nav.moment = 'none';
    }
    return;
  }
  if (nav.path.length === 0 && nav.looks === 0 && nav.faceTo === null) startLooks(ctx, c, rng, 2);
}
