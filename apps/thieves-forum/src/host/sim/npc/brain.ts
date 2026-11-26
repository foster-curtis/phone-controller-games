// The NPC shopper (SPEC §6.10): the state machine (technique 1: entering → wandering → approaching →
// browsing → buying → … → leaving, plus waiting in line and chasing a coin), detours and forgetting
// (technique 3), personality-driven speed and browse time (technique 4), human moments (technique 5:
// a pause before choosing, doubling back, waiting in line, the coin-chase hook) and steering
// (technique 2: seek + wander + separation, eased by the shared acceleration so no path is a straight
// robotic line). Drives NPCs and, later, takeover and walk-on characters (SPEC §6.18).
import type { Rng } from '@pcg/game-kit';
import type { StallId, Vec2 } from '../../../content/types';
import { spatialOf } from '../derived';
import { angleDiff, dist } from '../geometry';
import { easeVelocity } from '../movement';
import {
  clearPath,
  counterPoint,
  customerSpot,
  findPath,
  navGraph,
  queueSpot,
  type NavGraph,
} from '../nav';
import type { StepContext } from '../systems';
import { TUNING } from '../tuning';
import type { Character, EntityId, World } from '../types';
import { STEP_MS } from '../types';
import { NPC_HOOKS } from './hooks';
import type { NpcNav } from './types';

const T = TUNING.npc;
const DT = STEP_MS / 1000;

const between = (rng: Rng, [lo, hi]: readonly [number, number]) => lo + (hi - lo) * rng.next();

/** States in which a citizen holds a customer spot at `nav.stall`. */
const AT_SPOT = new Set(['approaching', 'browsing', 'buying']);

export function graphOf(ctx: StepContext): NavGraph {
  return navGraph(ctx.content.layout, ctx.content.balance.movement.bodyRadius);
}

/** A free customer spot at a stall, or −1 (one customer per spot, SPEC §6.6). */
export function freeSpot(world: World, ctx: StepContext, stall: StallId, rng: Rng): number {
  const n = T.spots;
  const taken = new Array<boolean>(n).fill(false);
  for (const c of world.characters) {
    const nav = c.npc.nav;
    if (c.control.k !== 'player' && nav && nav.stall === stall && AT_SPOT.has(c.npc.state)) {
      if (nav.spot >= 0) taken[nav.spot] = true;
    } else if (c.control.k === 'player') {
      // A player standing at the counter takes the spot too.
      for (let i = 0; i < n; i++) {
        const p = customerSpot(ctx.content.layout, stall, i, n);
        if (dist(c.x, c.y, p.x, p.y) < 0.7) taken[i] = true;
      }
    }
  }
  const free: number[] = [];
  for (let i = 0; i < n; i++) if (!taken[i]) free.push(i);
  return free.length ? free[rng.int(0, free.length - 1)]! : -1;
}

function walkTo(ctx: StepContext, c: Character, to: Vec2): void {
  c.npc.nav!.path = findPath(graphOf(ctx), c, to);
  c.npc.goal = { x: to.x, y: to.y };
}

function pause(ctx: StepContext, c: Character, rng: Rng): void {
  c.npc.nav!.pauseUntil = ctx.world.tick + ctx.ticks(between(rng, T.pauseMs));
}

function free(c: Character): void {
  c.activity = { k: 'free' };
}

/** Starts the walk off the map through an entry (never the gate, SPEC §6.10). */
export function startLeaving(ctx: StepContext, c: Character, rng: Rng): void {
  const entries = ctx.content.layout.entries;
  let exit = entries[0]!;
  if (rng.next() < T.leaveNearest) {
    let best = Infinity;
    for (const e of entries) {
      const d = dist(c.x, c.y, e.at.x, e.at.y);
      if (d < best) {
        best = d;
        exit = e;
      }
    }
  } else exit = rng.pick(entries);
  const nav = c.npc.nav!;
  releaseSpot(nav);
  nav.leg = 'exit';
  nav.exit = exit.id;
  nav.look = null;
  nav.path = [...findPath(graphOf(ctx), c, exit.at), { x: exit.spawn.x, y: exit.spawn.y }];
  c.npc.goal = { x: exit.spawn.x, y: exit.spawn.y };
  c.npc.state = 'leaving';
  c.activity = { k: 'leaving' };
}

function releaseSpot(nav: NpcNav): void {
  nav.spot = -1;
  nav.detour = false;
}

/** The open stall that sells `shop`, if any. */
function stallFor(world: World, shop: string): StallId | null {
  for (const s of world.stalls) if (s.open && s.shop === shop) return s.id;
  return null;
}

function randomLanePoint(ctx: StepContext, rng: Rng): Vec2 {
  const lanes = Object.values(ctx.content.layout.lanes);
  const lane = lanes[rng.int(0, lanes.length - 1)]!;
  const r = lane.rect;
  const pad = 1.2;
  return {
    x: r.x + pad + (r.w - 2 * pad) * rng.next(),
    y: r.y + pad + (r.h - 2 * pad) * rng.next(),
  };
}

/** Technique 1/3: the next leg — the next wish-list stall, or (forgetting) a wander somewhere. */
function chooseLeg(ctx: StepContext, c: Character, rng: Rng): void {
  const n = c.npc;
  const nav = n.nav!;
  // The stall it just left never counts as a fresh detour.
  nav.passed = nav.stall !== null ? [nav.stall] : [];
  nav.detour = false;
  nav.look = null;
  nav.brisk = n.personality.hurried && rng.next() < T.briskLeg;
  while (n.wishList.length > 0 && stallFor(ctx.world, n.wishList[0]!) === null) n.wishList.shift();
  if (n.wishList.length === 0) {
    startLeaving(ctx, c, rng);
    return;
  }
  if (rng.next() < n.personality.distractibility * T.forget) {
    nav.leg = 'roam';
    nav.stall = null;
    walkTo(ctx, c, randomLanePoint(ctx, rng));
    return;
  }
  const stall = stallFor(ctx.world, n.wishList[0]!)!;
  nav.leg = 'stall';
  nav.stall = stall;
  const s = ctx.content.layout.stalls[stall]!;
  walkTo(ctx, c, { x: (s.customer.x0 + s.customer.x1) / 2, y: s.customer.y + 0.8 });
}

/** Technique 1/5: take a free spot at the counter, or wait in line behind it. */
function beginApproach(ctx: StepContext, c: Character, stall: StallId, detour: boolean, rng: Rng) {
  const n = c.npc;
  const nav = n.nav!;
  nav.stall = stall;
  nav.detour = detour;
  nav.look = null;
  const spot = freeSpot(ctx.world, ctx, stall, rng);
  if (spot >= 0) {
    nav.spot = spot;
    walkTo(ctx, c, customerSpot(ctx.content.layout, stall, spot, T.spots));
    n.state = 'approaching';
    return;
  }
  if (detour) {
    // Full counter on a whim: just glance and move on.
    nav.detour = false;
    nav.slow = T.glanceFactor;
    nav.slowUntil = ctx.world.tick + ctx.ticks(between(rng, T.slowMs));
    nav.look = stall;
    return;
  }
  let k = 0;
  for (const o of ctx.world.characters)
    if (o !== c && o.npc.state === 'waiting' && o.npc.nav?.stall === stall) k++;
  nav.spot = -1;
  walkTo(ctx, c, queueSpot(ctx.content.layout, stall, k, T.queueGap));
  n.state = 'waiting';
  n.until = ctx.world.tick + ctx.ticks(T.waitMaxMs);
}

/** Technique 3: passing an open stall it doesn't need, it may slow, glance or stop to browse. */
function detours(ctx: StepContext, c: Character, rng: Rng): void {
  const nav = c.npc.nav!;
  const layout = ctx.content.layout;
  for (const st of ctx.world.stalls) {
    if (!st.open || st.id === nav.stall || nav.passed.includes(st.id)) continue;
    const cu = layout.stalls[st.id]!.customer;
    const cx = Math.max(cu.x0, Math.min(cu.x1, c.x));
    if (dist(c.x, c.y, cx, cu.y) > T.detourRadius) continue;
    nav.passed.push(st.id);
    if (rng.next() >= c.npc.personality.distractibility) continue;
    const r = rng.next();
    if (r < T.detourSlow || r < T.detourGlance) {
      nav.slow = r < T.detourSlow ? T.slowFactor : T.glanceFactor;
      nav.look = r < T.detourSlow ? null : st.id;
      nav.slowUntil = ctx.world.tick + ctx.ticks(between(rng, T.slowMs));
    } else if (ctx.content.shops[st.shop].sells) {
      beginApproach(ctx, c, st.id, true, rng);
    }
    return;
  }
}

/** Technique 5 hook (TF13): send a citizen's mind after a dropped or tossed coin at `at`. */
export function chaseCoin(ctx: StepContext, c: Character, at: Vec2): void {
  const nav = c.npc.nav!;
  releaseSpot(nav);
  nav.leg = 'coin';
  nav.look = null;
  walkTo(ctx, c, at);
  c.npc.state = 'chasingCoin';
  free(c);
}

function standing(c: Character, tick: number): boolean {
  const s = c.npc.state;
  return (
    s === 'browsing' ||
    s === 'buying' ||
    tick < c.npc.nav!.pauseUntil ||
    c.npc.nav!.path.length === 0
  );
}

/** Technique 1: one step of the state machine. Returns true if the citizen walked off the map. */
export function think(ctx: StepContext, c: Character, rng: Rng): boolean {
  const n = c.npc;
  const nav = n.nav!;
  const t = ctx.world.tick;
  switch (n.state) {
    case 'entering':
      if (nav.path.length === 0) {
        free(c);
        n.state = 'wandering';
        nav.leg = 'none';
        pause(ctx, c, rng);
      }
      break;
    case 'wandering': {
      if (t < nav.pauseUntil) break;
      if (nav.leg === 'none') {
        chooseLeg(ctx, c, rng);
        break;
      }
      if (nav.path.length === 0) {
        if (nav.leg === 'stall' && nav.stall !== null) beginApproach(ctx, c, nav.stall, false, rng);
        else {
          nav.leg = 'none';
          pause(ctx, c, rng);
        }
        break;
      }
      if (nav.leg === 'stall' && nav.stall !== null) {
        const s = ctx.content.layout.stalls[nav.stall]!;
        const cx = Math.max(s.customer.x0, Math.min(s.customer.x1, c.x));
        if (dist(c.x, c.y, cx, s.customer.y) < T.approachRadius) {
          beginApproach(ctx, c, nav.stall, false, rng);
          break;
        }
        // Technique 5: now and then, turn round and walk back a few steps.
        if (rng.next() < T.doubleBack / (4 * 60) && c.vx * c.vx + c.vy * c.vy > 0.5) {
          const sp = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
          const bx = graphOf(ctx).bounds;
          const back = {
            x: Math.max(bx.x0 + 0.5, Math.min(bx.x1 - 0.5, c.x - (c.vx / sp) * T.doubleBackDist)),
            y: Math.max(bx.y0 + 0.5, Math.min(bx.y1 - 0.5, c.y - (c.vy / sp) * T.doubleBackDist)),
          };
          if (clearPath(graphOf(ctx), c, back)) {
            nav.leg = 'back';
            nav.path = [back];
            break;
          }
        }
      }
      detours(ctx, c, rng);
      break;
    }
    case 'approaching':
      if (nav.path.length === 0) {
        n.state = 'browsing';
        c.activity = { k: 'browsing', stall: nav.stall! };
        // Browse plus buy stays under the stand-still cap (C1 "never frozen").
        const cap = T.maxStillMs - T.buyMs[1] - 500;
        const ms = Math.min(cap, n.personality.browseMs * (nav.detour ? T.detourBrowse : 1));
        n.until = t + ctx.ticks(ms);
      }
      break;
    case 'waiting': {
      const spot = nav.stall === null ? -1 : freeSpot(ctx.world, ctx, nav.stall, rng);
      if (spot >= 0) {
        nav.spot = spot;
        walkTo(ctx, c, customerSpot(ctx.content.layout, nav.stall!, spot, T.spots));
        n.state = 'approaching';
      } else if (t >= n.until) {
        // Gave up on the line: try the rest of the list first.
        if (n.wishList.length > 1) n.wishList.push(n.wishList.shift()!);
        n.state = 'wandering';
        nav.leg = 'none';
        nav.stall = null;
        pause(ctx, c, rng);
      }
      break;
    }
    case 'browsing':
      faceStall(ctx, c);
      if (t >= n.until) {
        if (
          nav.detour &&
          n.wishList.length > 0 &&
          n.wishList[0] === ctx.world.stalls[nav.stall!]!.shop
        ) {
          // Browsed on a whim at the very stall it wanted: buy here.
          nav.detour = false;
          n.state = 'buying';
          n.until = t + ctx.ticks(between(rng, T.buyMs));
        } else if (nav.detour) {
          releaseSpot(nav);
          free(c);
          n.state = 'wandering';
          nav.leg = 'none';
        } else {
          n.state = 'buying';
          n.until = t + ctx.ticks(between(rng, T.buyMs));
        }
      }
      break;
    case 'buying':
      faceStall(ctx, c);
      if (t >= n.until) {
        NPC_HOOKS.buy(ctx, c, nav.stall!);
        n.wishList.shift();
        releaseSpot(nav);
        free(c);
        n.state = 'wandering';
        nav.leg = 'none';
      }
      break;
    case 'chasingCoin':
      if (nav.path.length === 0) {
        n.state = 'wandering';
        nav.leg = 'none';
        pause(ctx, c, rng);
      }
      break;
    case 'leaving':
      if (nav.path.length === 0) return true;
      break;
    default:
      // glancing / pointing are TF14's; until then, carry on shopping.
      n.state = 'wandering';
      nav.leg = 'none';
  }
  // Safety (C1 "never frozen"): nobody stands still too long.
  if (nav.still > ctx.ticks(T.maxStillMs)) {
    nav.pauseUntil = t;
    n.until = Math.min(n.until, t);
    nav.still = 0;
    if (n.state === 'browsing' || n.state === 'buying') {
      if (!nav.detour && nav.stall !== null) {
        NPC_HOOKS.buy(ctx, c, nav.stall);
        n.wishList.shift();
      }
      releaseSpot(nav);
      free(c);
      n.state = 'wandering';
      nav.leg = 'none';
    }
  }
  return false;
}

function faceStall(ctx: StepContext, c: Character): void {
  const p = counterPoint(ctx.content.layout, c.npc.nav!.stall!);
  c.facing = Math.atan2(p.y - c.y, p.x - c.x);
}

const near: EntityId[] = [];

/** Technique 2: seek + wander + separation, at the personality's speed, eased like everyone. */
export function steer(ctx: StepContext, c: Character, rng: Rng): void {
  const n = c.npc;
  const nav = n.nav!;
  const t = ctx.world.tick;
  const b = ctx.content.balance;
  const g = graphOf(ctx);
  // Stuck / still bookkeeping.
  const moved = dist(c.x, c.y, nav.lastX, nav.lastY);
  nav.lastX = c.x;
  nav.lastY = c.y;
  nav.still = moved < 0.002 ? nav.still + 1 : 0;

  if (standing(c, t) || ctx.world.phase === 'opening') {
    nav.stuck = 0;
    easeVelocity(c, 0, 0);
    return;
  }
  // Drop reached waypoints; skip ahead when the next one is in clear view (smooth corners).
  while (nav.path.length > 1) {
    const p = nav.path[0]!;
    if (dist(c.x, c.y, p.x, p.y) < T.waypoint || clearPath(g, c, nav.path[1]!)) nav.path.shift();
    else break;
  }
  const goal = nav.path[0]!;
  const final = nav.path.length === 1;
  const d = dist(c.x, c.y, goal.x, goal.y);
  if (final && d < T.arrive) {
    nav.path.shift();
    easeVelocity(c, 0, 0);
    return;
  }
  let sx = (goal.x - c.x) / d;
  let sy = (goal.y - c.y) / d;
  // Wander: a slowly drifting angle off the seek direction.
  nav.wander += (rng.next() - 0.5) * 2 * T.wanderStep;
  nav.wander = Math.max(-T.wanderMax, Math.min(T.wanderMax, nav.wander * 0.995));
  const cw = Math.cos(nav.wander);
  const sw = Math.sin(nav.wander);
  const wx = sx * cw - sy * sw;
  const wy = sx * sw + sy * cw;
  // Separation from neighbours.
  let px = 0;
  let py = 0;
  const sepR = b.crowd.separationRadius;
  spatialOf(ctx.world).query(c.x, c.y, sepR, near);
  for (const id of near) {
    if (id === c.id) continue;
    const o =
      ctx.world.characters.find((x) => x.id === id) ?? ctx.world.guards.find((x) => x.id === id);
    if (!o) continue;
    const dx = c.x - o.x;
    const dy = c.y - o.y;
    const dd = Math.sqrt(dx * dx + dy * dy);
    if (dd < 1e-6 || dd >= sepR + o.r) continue;
    const k = (sepR + o.r - dd) / (sepR + o.r);
    px += (dx / dd) * k;
    py += (dy / dd) * k;
  }
  // Glancing: lean toward the stall it's looking at.
  let lx = 0;
  let ly = 0;
  if (nav.look !== null && t < nav.slowUntil) {
    const p = counterPoint(ctx.content.layout, nav.look);
    const ld = dist(c.x, c.y, p.x, p.y);
    if (ld > 1e-6) {
      lx = ((p.x - c.x) / ld) * 0.4;
      ly = ((p.y - c.y) / ld) * 0.4;
    }
  } else if (t >= nav.slowUntil) {
    nav.look = null;
    nav.slow = 1;
  }
  sx = sx * b.crowd.seek + wx * b.crowd.wander + px * b.crowd.separation + lx;
  sy = sy * b.crowd.seek + wy * b.crowd.wander + py * b.crowd.separation + ly;
  const sl = Math.sqrt(sx * sx + sy * sy);
  if (sl < 1e-6) {
    easeVelocity(c, 0, 0);
    return;
  }
  let speed = (nav.brisk ? b.movement.brisk : b.movement.walk) * n.personality.speed;
  if (t < nav.slowUntil) speed *= nav.slow;
  if (final && d < T.slowRadius) speed *= Math.max(0.3, d / T.slowRadius);
  easeVelocity(c, (sx / sl) * speed, (sy / sl) * speed);

  // Stuck: walking but not getting anywhere → find a fresh way.
  nav.stuck = moved < speed * DT * 0.2 ? nav.stuck + 1 : 0;
  if (nav.stuck > ctx.ticks(T.stuckMs)) {
    nav.stuck = 0;
    const end = nav.path[nav.path.length - 1]!;
    // Nearly there (someone's standing on the spot), or an aside (doubling back, a roam, a coin)
    // that can't be reached: count it as reached.
    const aside = nav.leg === 'back' || nav.leg === 'roam' || nav.leg === 'coin';
    nav.path = aside || (final && d < T.closeEnough) ? [] : findPath(g, c, end);
    nav.wander = angleDiff(rng.next() * 2 * Math.PI, 0) * 0.5;
    if (n.state === 'wandering' && nav.leg !== 'exit') {
      // Give way: a short sidestep pause, then on.
      nav.pauseUntil = t + ctx.ticks(between(rng, T.pauseMs));
    }
  }
}
