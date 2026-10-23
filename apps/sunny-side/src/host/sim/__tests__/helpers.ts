import { BUTTON_DASH, BUTTON_SLAM } from '../../../shared/messages';
import type { EggState, GhostState, SimEvent, SimPlayerId } from '../types';
import { SimWorld } from '../world';

/** A virtual phone: holds stick/buttons/counters and pushes them into the sim on every change. */
export class Pad {
  x = 0;
  y = 0;
  buttons = 0;
  dashCount = 0;
  slamCount = 0;

  constructor(
    private readonly sim: SimWorld,
    readonly id: SimPlayerId,
  ) {
    this.send();
  }

  send(): this {
    this.sim.setInput(this.id, [this.x, this.y, this.buttons, this.dashCount, this.slamCount]);
    return this;
  }

  stick(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this.send();
  }

  /** Tap DASH (press + release between two samples: only the counter moves). */
  dash(by = 1): this {
    this.dashCount += by;
    return this.send();
  }

  /** Tap SLAM between two samples (only the counter moves). */
  slam(): this {
    this.slamCount += 1;
    return this.send();
  }

  slamDown(): this {
    this.slamCount += 1;
    this.buttons |= BUTTON_SLAM;
    return this.send();
  }

  slamUp(): this {
    this.buttons &= ~BUTTON_SLAM;
    return this.send();
  }

  holdDashBit(held: boolean): this {
    this.buttons = held ? this.buttons | BUTTON_DASH : this.buttons & ~BUTTON_DASH;
    return this.send();
  }
}

export interface Setup {
  sim: SimWorld;
  pads: Record<string, Pad>;
}

/**
 * Start a round with `ids`, optionally teleport eggs, create a pad per id and run one warm-up
 * step so every pad's counters are baselined (tick = 1 afterwards).
 */
export function setup(
  ids: string[],
  place: Record<string, [number, number]> = {},
  opts: { seed?: number; frozen?: string[] } = {},
): Setup {
  const sim = new SimWorld({ seed: opts.seed ?? 1 });
  sim.startRound(ids.map((id) => ({ id, frozen: opts.frozen?.includes(id) ?? false })));
  for (const [id, [x, y]] of Object.entries(place)) sim.place(id, x, y);
  const pads: Record<string, Pad> = {};
  for (const id of ids) pads[id] = new Pad(sim, id);
  sim.step();
  return { sim, pads };
}

/** Park extra eggs in a tidy row far from the action (for 8-player arenas, radius ≈ 509). */
export function parkRow(ids: string[], y = 420): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  ids.forEach((id, i) => (out[id] = [-200 + (400 * i) / Math.max(1, ids.length - 1), y]));
  return out;
}

export function run(sim: SimWorld, steps: number): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < steps; i++) all.push(...sim.step());
  return all;
}

export function egg(sim: SimWorld, id: string): EggState {
  const e = sim.snapshot().eggs.find((x) => x.id === id);
  if (!e) throw new Error(`no egg ${id}`);
  return e;
}

export function maybeEgg(sim: SimWorld, id: string): EggState | undefined {
  return sim.snapshot().eggs.find((x) => x.id === id);
}

export function ghost(sim: SimWorld, id: string): GhostState {
  const g = sim.snapshot().ghosts.find((x) => x.id === id);
  if (!g) throw new Error(`no ghost ${id}`);
  return g;
}

export function speed(e: { vx: number; vy: number }): number {
  return Math.hypot(e.vx, e.vy);
}

export function ofType<T extends SimEvent['type']>(
  events: SimEvent[],
  type: T,
): Extract<SimEvent, { type: T }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

/** Teleport an egg out of the pan and step once: returns that step's events. */
export function pushOut(sim: SimWorld, id: string): SimEvent[] {
  const r = sim.snapshot().arena.radius;
  sim.place(id, r + 50, 0);
  return sim.step();
}

/** Eliminate `id` and step until its ghost exists. */
export function makeGhost(sim: SimWorld, id: string): void {
  pushOut(sim, id);
  for (let i = 0; i < 400; i++) {
    if (ofType(sim.step(), 'ghostSpawned').some((e) => e.id === id)) return;
  }
  throw new Error('ghost never spawned');
}
