// Guards (SPEC §6.12, §6.13, §12.3 step 5): patrol loop (upper lane → alley → lower lane → end passage,
// slowed in alleys by `movement`), view cones with line of sight, spotting a mid-steal thief, alerts,
// chase to the live or last-seen position, escape after `escapeMs` out of every chaser's sight, the
// locked-in collect for a landed tip, the march to the stocks, and escalation (activations → a
// reinforcement through the top gate, capped). Guards never grab NPCs and never react to browsing.
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are TF9's.
import type { Balance, LaneId, Vec2 } from '../../../content/types';
import { catches, lockIn } from '../catches';
import { dist } from '../geometry';
import { findPath, navGraph } from '../nav';
import type { GuardView } from '../snapshot';
import type { StepContext } from '../systems';
import type {
  ActivationCause,
  Character,
  EntityId,
  Guard,
  GuardMode,
  PlayerId,
  PoseId,
  Tick,
  World,
} from '../types';
import { canSee, coneHalfAngle, inCone, laneOf } from './sight';
import { GUARD_TUNING } from './tuning';
import type { GuardsApi } from './types';
import { STEP_MS } from '../types';

const DT = STEP_MS / 1000;

export type { GuardsApi } from './types';
export { canSee, inCone, inWedge, laneOf } from './sight';
export { GUARD_TUNING } from './tuning';

// ---- per-world bookkeeping outside `World` (like derived.ts) -------------------------------------

interface GuardBook {
  /** Starting guards placed (on the first `play` step). */
  started: boolean;
  /** Landed tips waiting for a free guard (SPEC §6.13). */
  pendingCollects: { thief: EntityId; tipper: PlayerId }[];
}
const books = new WeakMap<World, GuardBook>();
function book(world: World): GuardBook {
  let b = books.get(world);
  if (!b) {
    b = { started: false, pendingCollects: [] };
    books.set(world, b);
  }
  return b;
}

// ---- helpers -----------------------------------------------------------------------------------

const charOf = (world: World, id: EntityId): Character | null =>
  world.characters.find((c) => c.id === id) ?? null;

/** Guards chase and catch players only (SPEC §6.12 "never grab NPCs"). */
const isThiefCandidate = (c: Character): boolean => c.side !== null;

function nearestPatrolPoint(ctx: StepContext, p: Vec2): number {
  const pts = ctx.content.layout.patrol;
  let best = 0;
  let bd = Infinity;
  pts.forEach((q, i) => {
    const d = dist(p.x, p.y, q.x, q.y);
    if (d < bd - 1e-9) {
      bd = d;
      best = i;
    }
  });
  return best;
}

function stand(g: Guard, pose: PoseId = 'idle'): void {
  g.vx = 0;
  g.vy = 0;
  g.gait = 'idle';
  g.pose = pose;
}

/** Velocity toward `to` along the nav graph at `speed`; true once within `arrive`. */
function steer(ctx: StepContext, g: Guard, to: Vec2, speed: number, arrive: number): boolean {
  const d = dist(g.x, g.y, to.x, to.y);
  if (d <= arrive) return true;
  const path = findPath(navGraph(ctx.content.layout, g.r), g, to);
  const next = path[0] ?? to;
  const dx = next.x - g.x;
  const dy = next.y - g.y;
  const l = Math.sqrt(dx * dx + dy * dy);
  if (l < 1e-9) return true;
  // Don't overshoot the next point in one step.
  const s = Math.min(speed, l / DT);
  g.vx = (dx / l) * s;
  g.vy = (dy / l) * s;
  g.facing = Math.atan2(dy, dx);
  return false;
}

const patrolMode = (ctx: StepContext, g: Guard): GuardMode => ({
  k: 'patrol',
  waypoint: nearestPatrolPoint(ctx, g),
});

function backToPatrol(ctx: StepContext, g: Guard): void {
  g.mode = patrolMode(ctx, g);
  g.alert = false;
}

// ---- spawning and escalation -------------------------------------------------------------------

function newGuard(world: World, at: Vec2, mode: GuardMode, radius: number): Guard {
  const g: Guard = {
    id: world.nextId++,
    x: at.x,
    y: at.y,
    vx: 0,
    vy: 0,
    r: radius,
    rig: 'guard',
    facing: 0,
    gait: 'idle',
    pose: 'patrol',
    mode,
    alert: false,
    bangUntil: -1,
  };
  world.guards.push(g);
  return g;
}

/** Places a guard on the patrol loop at waypoint `wp` (starting guards; tests). */
export function spawnPatrolGuard(ctx: StepContext, wp: number): Guard {
  const pts = ctx.content.layout.patrol;
  const i = ((wp % pts.length) + pts.length) % pts.length;
  const next = (i + 1) % pts.length;
  return newGuard(
    ctx.world,
    pts[i]!,
    { k: 'patrol', waypoint: next },
    ctx.content.balance.movement.bodyRadius,
  );
}

function setGate(ctx: StepContext, open: boolean): void {
  if (ctx.world.gateOpen === open) return;
  ctx.world.gateOpen = open;
  ctx.emit({ ch: 'tv', e: 'gate', open });
}

/** A reinforcement walks in through the top gate (SPEC §6.12). */
export function spawnReinforcement(ctx: StepContext): Guard {
  const gate = ctx.content.layout.gate;
  setGate(ctx, true);
  const g = newGuard(
    ctx.world,
    gate.spawn,
    { k: 'enter' },
    ctx.content.balance.movement.bodyRadius,
  );
  g.facing = Math.PI / 2;
  ctx.emit({ ch: 'tv', e: 'reinforcement', guard: g.id });
  return g;
}

/**
 * One guard activation (SPEC §6.12): NPC alerts, merchant calls, tip-offs and spots across all guards.
 * Every `activationsPerGuard` activations another guard walks in through the gate, up to the cap.
 */
export function activate(ctx: StepContext, _cause: ActivationCause, _thief: EntityId): void {
  const w = ctx.world;
  const b = ctx.content.balance.guards;
  w.activations += 1;
  if (w.activations % b.activationsPerGuard === 0 && w.guards.length < b.cap)
    spawnReinforcement(ctx);
}

export function startingGuards(players: number, round: number, balance: Balance): number {
  const s = balance.guards.start;
  const row = players >= s.largeFrom ? s.large : s.small;
  const i = Math.min(Math.max(round, 1), row.length) - 1;
  return Math.min(row[i]!, balance.guards.cap);
}

function placeStartingGuards(ctx: StepContext): void {
  const w = ctx.world;
  const players = w.characters.filter((c) => c.side !== null).length;
  const n = startingGuards(players, w.round, ctx.content.balance);
  const pts = ctx.content.layout.patrol.length;
  for (let i = 0; i < n; i++) spawnPatrolGuard(ctx, Math.floor((i * pts) / n));
}

// ---- chase -------------------------------------------------------------------------------------

function startChase(g: Guard, thief: Character, alert: boolean): void {
  g.mode = { k: 'chase', thief: thief.id, lastSeen: { x: thief.x, y: thief.y }, unseenTicks: 0 };
  if (alert) g.alert = true;
}

const isChasing = (world: World, thief: EntityId): boolean =>
  world.guards.some((g) => g.mode.k === 'chase' && g.mode.thief === thief);

/** Guards free to answer an alert or a spot (not entering, collecting, marching or rushing). */
const answers = (g: Guard): boolean => g.mode.k === 'patrol' || g.mode.k === 'chase';

/** A patrolling guard spots a mid-steal player in his cone with clear LOS (SPEC §6.12). */
function spot(ctx: StepContext, g: Guard): void {
  const { world, content } = ctx;
  let best: Character | null = null;
  let bd = Infinity;
  for (const c of world.characters) {
    if (!isThiefCandidate(c) || !catches.catchable(ctx, c.id)) continue;
    // Mid-steal = a live GRAB or PICKPOCKET hold; browsing never counts.
    if (!world.holds.some((h) => h.actor === c.id && h.result === null)) continue;
    if (!inCone(g, c, content.layout, content.balance, world.gateOpen)) continue;
    const d = dist(g.x, g.y, c.x, c.y);
    if (d < bd - 1e-9) {
      bd = d;
      best = c;
    }
  }
  if (!best) return;
  const fresh = !isChasing(world, best.id);
  startChase(g, best, true);
  g.bangUntil = world.tick + ctx.ticks(GUARD_TUNING.bangMs);
  ctx.emit({ ch: 'tv', e: 'guardSpot', guard: g.id, at: best.id });
  if (fresh) activate(ctx, 'spot', best.id);
}

/** Chasers of each thief share sight: seen by any resets everyone's unseen clock (SPEC §6.12). */
function updateChases(ctx: StepContext): void {
  const { world, content } = ctx;
  const b = content.balance;
  const escapeTicks = ctx.ticks(b.guards.escapeMs);
  const thieves = new Set<EntityId>();
  for (const g of world.guards) if (g.mode.k === 'chase') thieves.add(g.mode.thief);
  for (const id of [...thieves].sort((x, y) => x - y)) {
    const thief = charOf(world, id);
    const chasers = world.guards.filter((g) => g.mode.k === 'chase' && g.mode.thief === id);
    if (!thief || !catches.catchable(ctx, id)) {
      // Caught by someone else, or gone: stand down quietly.
      for (const g of chasers) backToPatrol(ctx, g);
      continue;
    }
    const seen = chasers.some((g) => canSee(g, thief, content.layout, b, world.gateOpen));
    let escaped = false;
    for (const g of chasers) {
      const m = g.mode as Extract<GuardMode, { k: 'chase' }>;
      if (seen) {
        m.lastSeen = { x: thief.x, y: thief.y };
        m.unseenTicks = 0;
      } else {
        m.unseenTicks += 1;
        if (m.unseenTicks >= escapeTicks) escaped = true;
      }
    }
    if (escaped) {
      // Escape: nothing lost; every chaser gives up and resumes patrolling.
      for (const g of chasers) {
        backToPatrol(ctx, g);
        ctx.emit({ ch: 'tv', e: 'guardGiveUp', guard: g.id });
      }
    }
  }
}

// ---- alerts and tip-offs -----------------------------------------------------------------------

function raiseAlert(
  ctx: StepContext,
  thiefId: EntityId,
  lane: LaneId,
  cause: ActivationCause,
): void {
  const { world, content } = ctx;
  const thief = charOf(world, thiefId);
  if (!thief || !isThiefCandidate(thief)) return;
  activate(ctx, cause, thiefId);
  if (!catches.catchable(ctx, thiefId)) return;
  const free = world.guards.filter(answers);
  let responders = free.filter((g) => laneOf(content.layout, g) === lane);
  if (responders.length === 0 && free.length > 0) {
    let best = free[0]!;
    let bd = Infinity;
    for (const g of free) {
      const d = dist(g.x, g.y, thief.x, thief.y);
      if (d < bd - 1e-9) {
        bd = d;
        best = g;
      }
    }
    responders = [best];
  }
  for (const g of responders) {
    if (g.mode.k === 'chase' && g.mode.thief === thiefId) continue;
    startChase(g, thief, true);
  }
}

function assignCollect(ctx: StepContext, thief: Character, tipper: PlayerId): boolean {
  const pool = ctx.world.guards.filter((g) => g.mode.k === 'patrol');
  const cands = pool.length > 0 ? pool : ctx.world.guards.filter((g) => g.mode.k === 'chase');
  let best: Guard | null = null;
  let bd = Infinity;
  for (const g of cands) {
    const d = dist(g.x, g.y, thief.x, thief.y);
    if (d < bd - 1e-9) {
      bd = d;
      best = g;
    }
  }
  if (!best) return false;
  best.mode = { k: 'collect', thief: thief.id, tipper };
  best.alert = false;
  return true;
}

function collect(ctx: StepContext, thiefId: EntityId, tipper: PlayerId): void {
  const thief = charOf(ctx.world, thiefId);
  if (!thief || !isThiefCandidate(thief)) return;
  activate(ctx, 'tipOff', thiefId);
  if (!assignCollect(ctx, thief, tipper))
    book(ctx.world).pendingCollects.push({ thief: thiefId, tipper });
}

// ---- the step (SPEC §12.3 step 5) --------------------------------------------------------------

function stepGuard(ctx: StepContext, g: Guard): void {
  const { world, content } = ctx;
  const b = content.balance.guards;
  const m = g.mode;
  switch (m.k) {
    case 'enter': {
      const at = content.layout.gate.at;
      if (steerStraight(g, at, b.walkSpeed)) {
        backToPatrol(ctx, g);
        stand(g, 'patrol');
      } else {
        g.gait = 'walk';
        g.pose = 'patrol';
      }
      return;
    }
    case 'patrol': {
      const pts = content.layout.patrol;
      let target = pts[m.waypoint]!;
      if (dist(g.x, g.y, target.x, target.y) <= GUARD_TUNING.arrive) {
        m.waypoint = (m.waypoint + 1) % pts.length;
        target = pts[m.waypoint]!;
      }
      steer(ctx, g, target, b.walkSpeed, 0);
      g.gait = 'walk';
      g.pose = 'patrol';
      return;
    }
    case 'chase': {
      const thief = charOf(world, m.thief);
      if (!thief) return backToPatrol(ctx, g);
      const goal = m.unseenTicks === 0 ? { x: thief.x, y: thief.y } : m.lastSeen;
      if (m.unseenTicks === 0 && dist(g.x, g.y, thief.x, thief.y) <= b.catchReach) {
        stand(g, 'catch');
        catches.byGuard(ctx, g.id, thief.id, 'guardChase');
        return;
      }
      if (steer(ctx, g, goal, b.jogSpeed, 0.1)) stand(g, 'jog');
      else {
        g.gait = 'jog';
        g.pose = 'jog';
      }
      return;
    }
    case 'collect': {
      const thief = charOf(world, m.thief);
      if (!thief || !catches.catchable(ctx, m.thief)) return backToPatrol(ctx, g);
      // Locked in: always the live position, no escape (SPEC §6.13).
      if (dist(g.x, g.y, thief.x, thief.y) <= b.catchReach) {
        stand(g, 'catch');
        catches.byGuard(ctx, g.id, thief.id, 'guardTip', m.tipper);
        return;
      }
      steer(ctx, g, thief, b.jogSpeed, 0);
      g.gait = 'jog';
      g.pose = 'jog';
      return;
    }
    case 'march':
      stepMarch(ctx, g, m);
      return;
    case 'rush':
      return; // end-of-round rush (TF16)
  }
}

/** Straight line (the gate aisle is off the nav graph); true on arrival. */
function steerStraight(g: Guard, to: Vec2, speed: number): boolean {
  const d = dist(g.x, g.y, to.x, to.y);
  if (d <= GUARD_TUNING.arrive) {
    g.vx = 0;
    g.vy = 0;
    return true;
  }
  g.vx = ((to.x - g.x) / d) * speed;
  g.vy = ((to.y - g.y) / d) * speed;
  g.facing = Math.atan2(g.vy, g.vx);
  return false;
}

/** Where a thief stands to be locked into (or let out of) stocks slot `slot`. */
export function stocksFront(ctx: StepContext, slot: number): Vec2 {
  const s = ctx.content.layout.stocks;
  const p = s.slots[slot] ?? s.slots[0]!;
  return { x: p.x, y: s.rect.y - GUARD_TUNING.stocksFront };
}

function stepMarch(ctx: StepContext, g: Guard, m: Extract<GuardMode, { k: 'march' }>): void {
  const { world, content } = ctx;
  const b = content.balance;
  const thief = charOf(world, m.thief);
  if (!thief) return backToPatrol(ctx, g);
  const act = thief.activity;
  if (act.k === 'caught') {
    stand(g, 'catch');
    thief.vx = 0;
    thief.vy = 0;
    if (world.tick < act.until) return;
    thief.activity = { k: 'marched', guard: g.id };
    marchStarted.set(thief, world.tick);
  }
  if (thief.activity.k !== 'marched') return backToPatrol(ctx, g);
  const front = stocksFront(ctx, m.slot);
  const since = marchStarted.get(thief) ?? world.tick;
  const timedOut = world.tick - since >= ctx.ticks(GUARD_TUNING.marchMaxMs);
  const thiefThere = dist(thief.x, thief.y, front.x, front.y) <= GUARD_TUNING.arrive * 2;
  if (thiefThere || timedOut) {
    lockIn(ctx, thief.id, m.slot);
    stand(g, 'patrol');
    backToPatrol(ctx, g);
    return;
  }
  // The guard leads beside the stocks; the thief walks a step behind him.
  const lead = { x: front.x + GUARD_TUNING.marchGap, y: front.y };
  if (steer(ctx, g, lead, b.guards.walkSpeed, GUARD_TUNING.arrive)) stand(g, 'march');
  else {
    g.gait = 'walk';
    g.pose = 'march';
  }
  const tx = thief.x;
  const ty = thief.y;
  const goal = dist(g.x, g.y, lead.x, lead.y) <= GUARD_TUNING.arrive * 2 ? front : g;
  const d = dist(tx, ty, goal.x, goal.y);
  const want = goal === front ? 0 : GUARD_TUNING.marchGap;
  if (d <= want + 0.05) {
    thief.vx = 0;
    thief.vy = 0;
  } else {
    const path = findPath(navGraph(content.layout, thief.r), thief, goal);
    const next = path[0] ?? goal;
    const nx = next.x - tx;
    const ny = next.y - ty;
    const l = Math.sqrt(nx * nx + ny * ny) || 1;
    const speed = b.guards.walkSpeed * 1.1;
    thief.vx = (nx / l) * speed;
    thief.vy = (ny / l) * speed;
  }
}

/** Tick each march started (outside `World`; a march lasts seconds). */
const marchStarted = new WeakMap<Character, Tick>();

export function step(ctx: StepContext): void {
  const { world } = ctx;
  if (world.phase !== 'play') {
    for (const g of world.guards) if (g.mode.k !== 'rush') stand(g, g.pose);
    return;
  }
  const bk = book(world);
  if (!bk.started) {
    bk.started = true;
    placeStartingGuards(ctx);
  }
  // Landed tips waiting for a guard.
  if (bk.pendingCollects.length > 0) {
    const waiting = bk.pendingCollects;
    bk.pendingCollects = [];
    for (const p of waiting) {
      const thief = charOf(world, p.thief);
      if (!thief || !catches.catchable(ctx, p.thief)) continue;
      if (!assignCollect(ctx, thief, p.tipper)) bk.pendingCollects.push(p);
    }
  }
  for (const g of world.guards) if (g.mode.k === 'patrol') spot(ctx, g);
  updateChases(ctx);
  for (const g of [...world.guards]) stepGuard(ctx, g);
  // The gate closes once nobody is walking in through it.
  if (world.gateOpen && !world.guards.some((g) => g.mode.k === 'enter' || g.mode.k === 'rush'))
    setGate(ctx, false);
}

export const guards: GuardsApi = {
  raiseAlert,
  collect,
  startingGuards,
};

// ---- view ---------------------------------------------------------------------------------------

/** The renderer's guard (SPEC §12.3 views): cone, red while chasing, "!" after a spot. */
export function guardView(g: Guard, tick: Tick, balance: Balance): GuardView {
  return {
    id: g.id,
    rig: 'guard',
    pose: g.pose,
    x: g.x,
    y: g.y,
    facing: g.facing,
    gait: g.gait,
    cone: {
      dir: g.facing,
      range: balance.guards.coneRange,
      halfAngle: coneHalfAngle(balance),
      alert: g.alert,
    },
    bang: tick < g.bangUntil,
  };
}
