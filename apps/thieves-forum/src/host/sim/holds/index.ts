// Host hold machine (SPEC §3, §6.7, §6.8, §6.13, §12.3): GRAB and PICKPOCKET are measured here, from the
// actor's `hold` bit, never on the phone. An arm waits up to ARM_WAIT_MS for the bit; the hold starts on
// the first step that sees it set and completes at `endTick` if the bit is still set then (an input
// that arrives exactly on a step boundary is seen the next step, so the host-observed hold is
// `endTick − startTick` steps). Any of bit clear, stick moved (move or turn), victim out of reach, or the
// merchant back behind his counter (back shelf) cancels it. Completion only sets `result`: the owners of
// stall theft (TF8) and pickpocketing (TF14) read completed holds later in the same step; ended holds are
// dropped at the start of the next one. Phone feedback is `phone` events only (SPEC §6.11).
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the machine API froze at TF3.
import { grabMs } from '../../../content/items';
import type { HoldKind, HoldResult } from '../../../shared/hold';
import { merchants } from '../merchants';
import type { StepContext } from '../systems';
import {
  STEP_MS,
  type Character,
  type EntityId,
  type Hold,
  type HoldTarget,
  type PlayerId,
  type Tick,
  type World,
} from '../types';
import { ARM_WAIT_MS, type HoldMachineState, type HoldsApi } from './types';

export type { HoldsApi } from './types';
export { ARM_WAIT_MS, type HoldArm, type HoldMachineState } from './types';

// ---- lookups -----------------------------------------------------------------------------------

function machine(world: World): HoldMachineState {
  return (world.holdMachine ??= { nextId: 1, arms: [] });
}

function character(world: World, id: EntityId): Character | null {
  return world.characters.find((c) => c.id === id) ?? null;
}

function playerOf(c: Character): PlayerId | null {
  return c.control.k === 'npc' ? null : c.control.playerId;
}

/** The actor's `hold` bit this step (no input = released; staleness is the input step's, §12.5). */
function holding(ctx: StepContext, c: Character): boolean {
  const p = playerOf(c);
  return p !== null && (ctx.inputs.get(p)?.hold ?? false);
}

/** Any stick input this step means the actor moved or turned (facing follows the stick). */
function steering(ctx: StepContext, c: Character): boolean {
  const p = playerOf(c);
  const move = p === null ? undefined : ctx.inputs.get(p)?.move;
  return move !== undefined && (move.x !== 0 || move.y !== 0);
}

function slotOf(world: World, stall: number, slot: number) {
  const s = world.stalls.find((st) => st.id === stall);
  return { stall: s ?? null, slot: s?.slots.find((sl) => sl.slot === slot) ?? null };
}

/** The back shelf is reachable only while the stall's merchant is away (SPEC §6.7). */
function shelfReachable(world: World, stall: number): boolean {
  const s = world.stalls.find((st) => st.id === stall);
  const m = s?.merchant == null ? null : world.merchants.find((mm) => mm.id === s.merchant);
  return m != null && merchants.isAway(m);
}

function inReach(ctx: StepContext, actor: Character, victim: Character): boolean {
  return Math.hypot(victim.x - actor.x, victim.y - actor.y) <= ctx.content.balance.pickpocket.reach;
}

/** Whether `actor` may hold `target` now (one hold at a time; one holder per item). */
function allowed(ctx: StepContext, actor: Character, target: HoldTarget): boolean {
  const w = ctx.world;
  if (holds.activeFor(w, actor.id)) return false;
  if (target.k === 'pocket') {
    const victim = character(w, target.victim);
    return victim !== null && victim.id !== actor.id;
  }
  const { stall, slot } = slotOf(w, target.stall, target.slot);
  if (!stall?.open || !slot || slot.item === null) return false;
  if (slot.heldBy !== null && slot.heldBy !== actor.id) return false;
  return !target.fromShelf || shelfReachable(w, target.stall);
}

/** Why a live hold must cancel this step, or null. */
function cancelled(ctx: StepContext, h: Hold, actor: Character): boolean {
  if (!holding(ctx, actor) || steering(ctx, actor)) return true;
  const w = ctx.world;
  if (h.target.k === 'pocket') {
    const victim = character(w, h.target.victim);
    return victim === null || !inReach(ctx, actor, victim);
  }
  const { slot } = slotOf(w, h.target.stall, h.target.slot);
  if (!slot || slot.item === null) return true;
  // Back shelf: the merchant stepping back behind his counter cancels (not caught), SPEC §6.7.
  return h.target.fromShelf && !shelfReachable(w, h.target.stall);
}

function durationFor(ctx: StepContext, kind: HoldKind, target: HoldTarget): number | null {
  if (kind === 'pickpocket' || target.k === 'pocket') return ctx.content.balance.pickpocket.holdMs;
  const { slot } = slotOf(ctx.world, target.stall, target.slot);
  const def = slot?.item == null ? null : ctx.content.items.find((i) => i.id === slot.item);
  return def ? grabMs(def, target.fromShelf) : null;
}

// ---- start / end -------------------------------------------------------------------------------

function begin(
  ctx: StepContext,
  actor: Character,
  kind: HoldKind,
  target: HoldTarget,
  durationMs: number,
): Hold | null {
  if (!allowed(ctx, actor, target)) return null;
  const w = ctx.world;
  const hold: Hold = {
    id: machine(w).nextId++,
    kind,
    actor: actor.id,
    target,
    startTick: w.tick,
    endTick: w.tick + ctx.ticks(durationMs),
    result: null,
  };
  w.holds.push(hold);
  if (target.k === 'item') {
    const { slot } = slotOf(w, target.stall, target.slot);
    if (slot) slot.heldBy = actor.id;
  }
  actor.activity = { k: 'holding', hold: hold.id };
  // Hot hands from the start of any steal, whatever the outcome (SPEC §6.13).
  actor.hotUntil = w.tick + ctx.ticks(ctx.content.balance.catch.hotMs);
  const player = playerOf(actor);
  if (player !== null) {
    ctx.emit({
      ch: 'phone',
      player,
      e: 'holdStart',
      hold: hold.id,
      kind,
      durationMs,
      ...(target.k === 'item' ? { stall: target.stall, slot: target.slot } : {}),
    });
  }
  return hold;
}

function arm(
  ctx: StepContext,
  actorId: EntityId,
  kind: HoldKind,
  target: HoldTarget,
  durationMs: number,
): boolean {
  const actor = character(ctx.world, actorId);
  if (!actor || !allowed(ctx, actor, target)) return false;
  const st = machine(ctx.world);
  // One arm per actor: the latest press wins.
  st.arms = st.arms.filter((a) => a.actor !== actorId);
  st.arms.push({
    actor: actorId,
    kind,
    target,
    durationMs,
    expiresAt: ctx.world.tick + ctx.ticks(ARM_WAIT_MS),
  });
  return true;
}

// ---- grace and hot hands (pure) ----------------------------------------------------------------

/**
 * In-person catch rule in ms (SPEC §6.13): mid-steal while `live`, or within `graceMs` of the last hold
 * ending (inclusive: 300 ms counts, 301 ms doesn't). `nowMs` is sim time (`tick × STEP_MS`).
 */
export function midStealAt(
  c: Pick<Character, 'holdEndedAt'>,
  live: boolean,
  nowMs: number,
  graceMs: number,
): boolean {
  if (live) return true;
  return c.holdEndedAt >= 0 && nowMs - c.holdEndedAt * STEP_MS <= graceMs + 1e-9;
}

/** Hot hands (SPEC §6.13): from the start of a steal through `hotUntil`. */
export function isHot(c: Pick<Character, 'hotUntil'>, tick: Tick): boolean {
  return c.hotUntil >= 0 && tick <= c.hotUntil;
}

// ---- the API -----------------------------------------------------------------------------------

export const holds: HoldsApi = {
  start(ctx, actorId, kind, target) {
    const actor = character(ctx.world, actorId);
    const ms = durationFor(ctx, kind, target);
    return actor && ms !== null ? begin(ctx, actor, kind, target, ms) : null;
  },

  end(ctx, hold, result: HoldResult) {
    if (hold.result !== null) return;
    const w = ctx.world;
    hold.result = result;
    if (hold.target.k === 'item') {
      const { slot } = slotOf(w, hold.target.stall, hold.target.slot);
      if (slot?.heldBy === hold.actor) slot.heldBy = null;
    }
    const actor = character(w, hold.actor);
    if (!actor) return;
    actor.holdEndedAt = w.tick;
    if (actor.activity.k === 'holding' && actor.activity.hold === hold.id) {
      actor.activity =
        hold.target.k === 'item' ? { k: 'browsing', stall: hold.target.stall } : { k: 'free' };
    }
    const player = playerOf(actor);
    if (player !== null) ctx.emit({ ch: 'phone', player, e: 'holdEnd', hold: hold.id, result });
  },

  activeFor(world, actor) {
    return world.holds.find((h) => h.actor === actor && h.result === null) ?? null;
  },

  isMidSteal(world, actor, graceTicks) {
    if (holds.activeFor(world, actor)) return true;
    const c = character(world, actor);
    return c !== null && c.holdEndedAt >= 0 && world.tick - c.holdEndedAt <= graceTicks;
  },

  armGrab(ctx, actor, stall, slot, ms) {
    const s = slotOf(ctx.world, stall, slot).slot;
    if (!s) return false;
    return arm(ctx, actor, 'grab', { k: 'item', stall, slot, fromShelf: s.row === 'shelf' }, ms);
  },

  armPickpocket(ctx, actor, victim) {
    const ms = ctx.content.balance.pickpocket.holdMs;
    return arm(ctx, actor, 'pickpocket', { k: 'pocket', victim }, ms);
  },

  caught(ctx, actor) {
    const h = holds.activeFor(ctx.world, actor);
    if (h) holds.end(ctx, h, 'caught');
    return h;
  },

  isHot,
};

// ---- the step (SPEC §12.3 step 2) --------------------------------------------------------------

export function step(ctx: StepContext): void {
  const w = ctx.world;
  // Holds that ended last step have been seen by everyone; drop them (in place: callers may hold refs).
  for (let i = w.holds.length - 1; i >= 0; i--)
    if (w.holds[i]!.result !== null) w.holds.splice(i, 1);

  // Live holds: cancel first, then complete (a release seen on the end tick cancels).
  for (const h of [...w.holds]) {
    const actor = character(w, h.actor);
    if (!actor || cancelled(ctx, h, actor)) holds.end(ctx, h, 'cancelled');
    else if (w.tick >= h.endTick) holds.end(ctx, h, 'complete');
  }

  // Arms: start on the first step that sees the bit; disarm after ARM_WAIT_MS.
  const st = w.holdMachine;
  if (!st || st.arms.length === 0) return;
  const waiting = st.arms;
  st.arms = [];
  for (const a of waiting) {
    const actor = character(w, a.actor);
    if (!actor) continue;
    if (holding(ctx, actor)) begin(ctx, actor, a.kind, a.target, a.durationMs);
    else if (w.tick < a.expiresAt) st.arms.push(a);
  }
}
