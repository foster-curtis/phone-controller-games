// The fixed system step order and each subsystem's step signature (SPEC §12.3). One step runs every
// system once, in this order, against one `StepContext`; the order is part of the determinism contract.
// Core steps (`input`, `movement`, `separation`, `timers`) are the sim core's (TF2); the rest are the
// subsystem folders' `step` exports. The `Systems` record is assembled by the sim core.
// Frozen at TF0 (BUILD_PLAN §3): the order and signatures; additive changes only.
import type { Rng } from '@pcg/game-kit';
import type { Content } from '../../content/types';
import type { SimEvent } from './events';
import type { PlayerId, PlayerInput, SimCommand, Tick, World } from './types';

export const STEP_ORDER = [
  'input', // apply commands, sample inputs (staleness, edges)
  'holds', // GRAB / PICKPOCKET timing, completion, cancel
  'npc', // NPC minds, takeover and walk-on minds
  'merchants', // attention, glance, suspicion, dialog, fetch, bring forward, coin pick-up, catches
  'guards', // patrol, cones + LOS, spots, chase/escape, collect, march, reinforcements
  'pickpocket', // NPC victim glances, NPC catches
  'distractions', // the handler list (coin toss first)
  'catches', // in-person Catch!, guard catches, pots, payouts, stocks
  'economy', // stock + restock, pawn rate, NPC buying, phone buy/sell
  'lifecycle', // crowd count, walk-on hand-off, takeover, leave, phase changes
  'movement', // integrate velocities, walkable bounds
  'separation', // soft separation over the spatial hash
  'timers', // hot hands, immunity, stocks countdowns, round timer
] as const;
export type SystemName = (typeof STEP_ORDER)[number];

/** Everything a system may touch in one step. */
export interface StepContext {
  world: World;
  content: Content;
  /** This step's input per player (already staleness-filtered). */
  inputs: ReadonlyMap<PlayerId, PlayerInput>;
  /** This step's commands, in arrival order. */
  commands: readonly SimCommand[];
  /** The named seeded stream for (round seed, label), created once and reused (SPEC §12.3). */
  rng(label: string): Rng;
  /** Appends to `world.events`. */
  emit(event: SimEvent): void;
  /** Config ms → whole ticks (rounded). */
  ticks(ms: number): Tick;
}

export type SystemStep = (ctx: StepContext) => void;
export type Systems = Readonly<Record<SystemName, SystemStep>>;

/** One fixed step: clear events, run every system in `STEP_ORDER`, advance the tick. */
export function runStep(systems: Systems, ctx: StepContext): void {
  ctx.world.events.length = 0;
  for (const name of STEP_ORDER) systems[name](ctx);
  ctx.world.tick += 1;
}
