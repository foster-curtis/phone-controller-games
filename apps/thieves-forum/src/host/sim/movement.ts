// Movement for every body (SPEC §6.10 gaits and player movement, §6.11, §12.3 steps 11–12): one speed
// → gait → pose rule and one acceleration for players and NPCs alike, so movement can't tell them
// apart; integration, walkable-area collision from the layout, and soft separation over the spatial
// hash. Kinematic circles, no physics engine (SPEC §5).
import type { Balance, LayoutDef } from '../../content/types';
import { inRect, pushOutOfRect } from './geometry';
import { walkBox } from './nav';
import { spatialOf } from './derived';
import type { StepContext } from './systems';
import { TUNING } from './tuning';
import type { Body, Character, EntityId, Gait, PoseId, World } from './types';
import { STEP_MS } from './types';

const DT = STEP_MS / 1000;
/** Share of an overlap each separation pass removes (soft, SPEC §5). */
const SEPARATION_STIFFNESS = 0.6;

/** NPC walking speed range (tiles/s): every personality, plain walk to brisk (SPEC §6.10). */
export function npcSpeedRange(b: Balance): { walkMin: number; walkMax: number; max: number } {
  const [lo, hi] = b.npcs.personality.speed;
  return {
    walkMin: b.movement.walk * lo,
    walkMax: b.movement.walk * hi,
    max: b.movement.brisk * hi,
  };
}

/**
 * Stick magnitude → speed (SPEC §6.10 player movement): a slow shuffle, then a walk band inside the
 * NPCs' walking speeds, then a jog faster than any NPC at full tilt.
 */
export function playerSpeed(mag: number, b: Balance): number {
  const { dead, walkFrom } = TUNING.stick;
  const { walkMin, walkMax } = npcSpeedRange(b);
  if (mag < dead) return 0;
  if (mag < walkFrom)
    return b.movement.shuffle + ((walkMin - b.movement.shuffle) * (mag - dead)) / (walkFrom - dead);
  if (mag < b.movement.jogFrom)
    return walkMin + ((walkMax - walkMin) * (mag - walkFrom)) / (b.movement.jogFrom - walkFrom);
  return b.movement.jog;
}

/** One gait rule for every citizen, from speed alone (SPEC §6.11: movement is the disguise). */
export function gaitFor(speed: number, b: Balance): Gait {
  const { walkMin, walkMax, max } = npcSpeedRange(b);
  if (speed < TUNING.idleSpeed) return 'idle';
  if (speed < walkMin - 0.05) return 'shuffle';
  if (speed <= walkMax + 0.05) return 'walk';
  if (speed < (max + b.movement.jog) / 2) return 'brisk';
  if (speed < (b.movement.jog + b.movement.run) / 2) return 'jog';
  return 'run';
}

/** Eases a body's velocity toward (wx, wy) at the shared acceleration. */
export function easeVelocity(body: Body, wx: number, wy: number): void {
  const dx = wx - body.vx;
  const dy = wy - body.vy;
  const d = Math.sqrt(dx * dx + dy * dy);
  const max = TUNING.accel * DT;
  if (d <= max) {
    body.vx = wx;
    body.vy = wy;
  } else {
    body.vx += (dx / d) * max;
    body.vy += (dy / d) * max;
  }
}

/** Keeps a body in the walkable area: the walkable box (x only while on the map) and out of blockers. */
export function collide(
  layout: LayoutDef,
  body: Body,
  onMap: boolean,
  gateOpen = false,
  radius = body.r,
): void {
  const b = walkBox(layout);
  for (let pass = 0; pass < 2; pass++) {
    if (body.y < b.y0 + radius) body.y = b.y0 + radius;
    else if (body.y > b.y1 - radius) body.y = b.y1 - radius;
    if (onMap) {
      if (body.x < b.x0 + radius) body.x = b.x0 + radius;
      else if (body.x > b.x1 - radius) body.x = b.x1 - radius;
    }
    let moved = false;
    for (const r of layout.blockers) {
      if (gateOpen && r === layout.gate.rect) continue;
      if (pushOutOfRect(body, radius, r)) moved = true;
    }
    if (!moved) break;
  }
}

/** Walking on or off through an entry: the only time a citizen may stand outside the map's x range. */
export function offMapAllowed(c: Character): boolean {
  return c.activity.k === 'entering' || c.activity.k === 'leaving';
}

function poseFor(c: Character, speed: number): PoseId {
  switch (c.activity.k) {
    case 'browsing':
      return 'browse';
    case 'handsUp':
      return 'handsUp';
    case 'stocks':
      return 'stocks';
    case 'caught':
      return 'caught';
    default:
      if (speed < TUNING.idleSpeed) return 'idle';
      return c.gait === 'jog' || c.gait === 'run' ? 'run' : 'walk';
  }
}

/** Step 11: integrate velocities, keep bodies walkable, then gait, facing and pose from the result. */
export function stepMovement(ctx: StepContext): void {
  const { world, content } = ctx;
  const layout = content.layout;
  const b = content.balance;
  for (const c of world.characters) {
    c.x += c.vx * DT;
    c.y += c.vy * DT;
    // The stocks slots sit inside the stocks blocker; catches pins their occupants (TF9 hook).
    if (c.activity.k !== 'stocks') collide(layout, c, !offMapAllowed(c));
    const speed = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
    if (speed > TUNING.idleSpeed * 2) c.facing = Math.atan2(c.vy, c.vx);
    c.gait = gaitFor(speed, b);
    c.pose = poseFor(c, speed);
  }
  for (const m of world.merchants) {
    m.x += m.vx * DT;
    m.y += m.vy * DT;
  }
  for (const gd of world.guards) {
    // Alleys slow guards (SPEC §6.3, §6.12).
    const slow = layout.alleys.some((a) => inRect(gd.x, gd.y, a.rect)) ? b.guards.alleySpeed : 1;
    gd.x += gd.vx * DT * slow;
    gd.y += gd.vy * DT * slow;
    // A reinforcement walks the gate aisle, off the walkable box (TF9 hook).
    if (gd.mode.k !== 'enter') collide(layout, gd, true, world.gateOpen);
  }
}

// Reused per-step buffers.
const near: EntityId[] = [];
const byId = new Map<EntityId, Body>();

/** Rebuilds the world's spatial hash from characters and guards. */
export function rebuildSpatial(world: World): void {
  const h = spatialOf(world);
  h.clear();
  for (const c of world.characters) h.insert(c.id, c.x, c.y, c.r);
  for (const g of world.guards) h.insert(g.id, g.x, g.y, g.r);
}

/** Step 12: soft separation between characters and guards (they never hard-block, SPEC §5). */
export function stepSeparation(ctx: StepContext): void {
  const { world, content } = ctx;
  rebuildSpatial(world);
  const h = spatialOf(world);
  byId.clear();
  for (const c of world.characters) byId.set(c.id, c);
  for (const g of world.guards) byId.set(g.id, g);
  const pass = (a: Body) => {
    h.query(a.x, a.y, a.r + 0.5, near);
    for (const id of near) {
      if (id <= a.id) continue;
      const o = byId.get(id)!;
      let dx = o.x - a.x;
      let dy = o.y - a.y;
      const rr = a.r + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-6) {
        // Exactly on top of each other: split along x by id (deterministic).
        dx = 1;
        dy = 0;
        d = 1;
      }
      const push = ((rr - Math.sqrt(d2)) * SEPARATION_STIFFNESS) / 2;
      a.x -= (dx / d) * push;
      a.y -= (dy / d) * push;
      o.x += (dx / d) * push;
      o.y += (dy / d) * push;
    }
  };
  for (const c of world.characters) pass(c);
  for (const g of world.guards) pass(g);
  for (const c of world.characters) collide(content.layout, c, !offMapAllowed(c));
}
