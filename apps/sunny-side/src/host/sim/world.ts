// The headless sim (SPEC §8): one Matter engine stepped only by `step()`, in the §8 step order.
import Matter from 'matter-js';
import { arenaAt, isRingOut, spawnPoints, startRadiusFor } from './arena';
import { SIM_CONFIG, STEP_MS, msToSteps } from './config';
import { Egg } from './egg';
import type { Vec } from './egg';
import { GHOST_SPAWN_STEPS, Ghost } from './ghost';
import { InputTable, NEUTRAL_INPUT } from './inputs';
import { LastTouch } from './lastTouch';
import type { InputTuple } from '../../shared/messages';
import type {
  EggSpawn,
  RoundOptions,
  Sim,
  SimEvent,
  SimOptions,
  SimPlayerId,
  SimSnapshot,
} from './types';

const { Body, Composite, Engine, Events } = Matter;

const SUBSTEP_MS = STEP_MS / SIM_CONFIG.substeps;
/** px/s per Matter velocity unit (px per 1000/60 ms base step). */
const VELOCITY_TO_PX_S = 1000 / STEP_MS;

/** Small seeded PRNG (mulberry32) so spawn placement is reproducible. */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Contact {
  a: SimPlayerId;
  b: SimPlayerId;
  speed: number;
}

export class SimWorld implements Sim {
  private engine: Matter.Engine = this.createEngine();
  private readonly inputs = new InputTable();
  private readonly lastTouch = new LastTouch(msToSteps(SIM_CONFIG.lastTouch.windowMs));
  private readonly rng: () => number;
  private tick = 0;
  private startRadius = startRadiusFor(1);
  private radius = this.startRadius;
  private shrinking = false;
  /** Insertion order = spawn order = snapshot order. */
  private readonly eggs = new Map<SimPlayerId, Egg>();
  private readonly ghosts = new Map<SimPlayerId, Ghost>();
  /** Eliminated players waiting for their ghost: id → spawn tick. */
  private readonly pendingGhosts = new Map<SimPlayerId, number>();
  /** Matter body id → egg owner (ghost bodies are absent, so sensor overlaps are ignored). */
  private readonly eggByBody = new Map<number, SimPlayerId>();
  private contacts: Contact[] = [];
  /** True inside `step()`; removals requested then wait for the end of the step. */
  private stepping = false;
  private readonly pendingRemovals: SimPlayerId[] = [];

  constructor(opts: SimOptions = {}) {
    this.rng = createRng(opts.seed ?? 1);
  }

  private createEngine(): Matter.Engine {
    const engine = Engine.create({ enableSleeping: false });
    engine.gravity.x = 0;
    engine.gravity.y = 0;
    engine.gravity.scale = 0;
    Events.on(engine, 'collisionStart', (e: Matter.IEventCollision<Matter.Engine>) => {
      for (const pair of e.pairs) {
        const a = this.eggByBody.get(pair.bodyA.parent.id);
        const b = this.eggByBody.get(pair.bodyB.parent.id);
        if (a === undefined || b === undefined) continue;
        const va = Body.getVelocity(pair.bodyA.parent);
        const vb = Body.getVelocity(pair.bodyB.parent);
        const speed = Math.hypot(va.x - vb.x, va.y - vb.y) * VELOCITY_TO_PX_S;
        this.contacts.push({ a, b, speed });
      }
    });
    return engine;
  }

  /** The old engine (and its listener) is dropped; nothing else references it. */
  private disposeEngine(): void {
    Composite.clear(this.engine.world, false);
    Engine.clear(this.engine);
  }

  startRound(spawns: readonly EggSpawn[], opts: RoundOptions = {}): void {
    this.disposeEngine();
    this.engine = this.createEngine();
    this.tick = 0;
    this.eggs.clear();
    this.ghosts.clear();
    this.pendingGhosts.clear();
    this.eggByBody.clear();
    this.lastTouch.clear();
    // No stick or press-counter baseline survives into a new round (C3 phantom flinch).
    this.inputs.clear();
    this.contacts = [];
    this.pendingRemovals.length = 0;
    this.startRadius = startRadiusFor(spawns.length, opts.difficulty);
    this.radius = this.startRadius;
    this.shrinking = false;
    const points = spawnPoints(spawns.length, this.startRadius, this.rng() * 2 * Math.PI);
    spawns.forEach((s, i) => {
      const p = points[i]!;
      const egg = new Egg(s.id, p.x, p.y, p.facing);
      egg.setFrozen(s.frozen);
      this.eggs.set(s.id, egg);
      this.eggByBody.set(egg.body.id, s.id);
      Composite.add(this.engine.world, egg.body);
    });
  }

  setFrozen(id: SimPlayerId, frozen: boolean): void {
    this.eggs.get(id)?.setFrozen(frozen);
  }

  setInput(id: SimPlayerId, input: InputTuple | null): void {
    this.inputs.set(id, input);
  }

  removeEgg(id: SimPlayerId): void {
    if (this.stepping) this.pendingRemovals.push(id);
    else this.removeNow(id);
  }

  /** Egg and/or ghost leave the world silently; a scheduled ghost spawn is cancelled. */
  private removeNow(id: SimPlayerId): void {
    const egg = this.eggs.get(id);
    if (egg) {
      Composite.remove(this.engine.world, egg.body);
      this.eggs.delete(id);
      this.eggByBody.delete(egg.body.id);
    }
    const ghost = this.ghosts.get(id);
    if (ghost) {
      Composite.remove(this.engine.world, ghost.body);
      this.ghosts.delete(id);
    }
    this.pendingGhosts.delete(id);
    this.lastTouch.forget(id);
    this.inputs.delete(id);
  }

  step(): SimEvent[] {
    this.stepping = true;
    try {
      return this.runStep();
    } finally {
      this.stepping = false;
      for (const id of this.pendingRemovals.splice(0)) this.removeNow(id);
    }
  }

  private runStep(): SimEvent[] {
    const events: SimEvent[] = [];
    const tick = ++this.tick;

    // 1. Apply inputs (every record is consumed each step, so counters never go stale).
    const inputs = this.inputs.consume();
    for (const egg of this.eggs.values()) {
      egg.applyInput(inputs.get(egg.id) ?? NEUTRAL_INPUT, tick, events);
    }
    for (const ghost of this.ghosts.values()) {
      ghost.applyInput(inputs.get(ghost.id) ?? NEUTRAL_INPUT, tick);
    }

    // 2. Timers: slam charge, mass boosts, ghost wind-ups (→ pulses), ghost spawns.
    for (const egg of this.eggs.values()) egg.updateTimers(tick);
    for (const ghost of this.ghosts.values()) {
      for (const id of ghost.updateTimers(tick, this.eggs.values(), events)) {
        this.lastTouch.pulsed(id, tick);
      }
    }
    for (const [id, at] of this.pendingGhosts) {
      if (tick < at) continue;
      this.pendingGhosts.delete(id);
      const ghost = new Ghost(id, 0, 0);
      this.ghosts.set(id, ghost);
      Composite.add(this.engine.world, ghost.body);
      events.push({ type: 'ghostSpawned', id });
    }

    // 3. Physics.
    this.physicsStep();

    // 4. Post-step: last touch from collisions, ring-outs, arena shrink (+ ghost clamp).
    for (const c of this.contacts) {
      this.lastTouch.touch(c.a, c.b, tick);
      events.push({ type: 'collision', a: c.a, b: c.b, speed: c.speed });
    }
    this.contacts = [];

    for (const egg of [...this.eggs.values()]) {
      const { x, y } = egg.body.position;
      if (!isRingOut(x, y, this.radius)) continue;
      Composite.remove(this.engine.world, egg.body);
      this.eggs.delete(egg.id);
      this.eggByBody.delete(egg.body.id);
      this.pendingGhosts.set(egg.id, tick + GHOST_SPAWN_STEPS);
      events.push({
        type: 'eliminated',
        id: egg.id,
        by: this.lastTouch.creditFor(egg.id, tick),
        byGhost: this.lastTouch.byGhost(egg.id, tick),
        respawnMs: SIM_CONFIG.ghost.spawnDelayMs,
      });
    }

    const phase = arenaAt(tick, this.startRadius);
    if (phase.shrinking && !this.shrinking) events.push({ type: 'shrinkStart' });
    this.radius = phase.radius;
    this.shrinking = phase.shrinking;

    for (const ghost of this.ghosts.values()) {
      const { x, y } = ghost.body.position;
      const d = Math.hypot(x, y);
      if (d > this.radius) {
        Body.setPosition(ghost.body, { x: (x / d) * this.radius, y: (y / d) * this.radius });
      }
    }

    // 5. Round and score logic live in src/host/match (driven by the returned events).
    return events;
  }

  /** Accumulated accel (px/s²) every substep; accumulated Δv (px/s) once, in the first substep. */
  private physicsStep(): void {
    const bodies: { body: Matter.Body; accel: Vec; dv: Vec }[] = [
      ...this.eggs.values(),
      ...this.ghosts.values(),
    ];
    for (let i = 0; i < SIM_CONFIG.substeps; i++) {
      for (const { body, accel, dv } of bodies) {
        // Matter: Δ(px/ms) = F / m × dt(ms). accel px/s² → px/ms²; Δv px/s → px/ms over one substep.
        let fx = (accel.x / 1e6) * body.mass;
        let fy = (accel.y / 1e6) * body.mass;
        if (i === 0) {
          fx += ((dv.x / 1000) * body.mass) / SUBSTEP_MS;
          fy += ((dv.y / 1000) * body.mass) / SUBSTEP_MS;
        }
        if (fx !== 0 || fy !== 0) Body.applyForce(body, body.position, { x: fx, y: fy });
      }
      Engine.update(this.engine, SUBSTEP_MS);
    }
    for (const e of this.eggs.values()) e.clearForces();
    for (const g of this.ghosts.values()) g.clearForces();
  }

  snapshot(): SimSnapshot {
    return {
      tick: this.tick,
      arena: { radius: this.radius, startRadius: this.startRadius, shrinking: this.shrinking },
      eggs: [...this.eggs.values()].map((e) => e.snapshot(this.tick)),
      ghosts: [...this.ghosts.values()].map((g) => g.snapshot(this.tick)),
    };
  }

  destroy(): void {
    this.disposeEngine();
    this.eggs.clear();
    this.ghosts.clear();
    this.pendingGhosts.clear();
    this.eggByBody.clear();
    this.inputs.clear();
    this.pendingRemovals.length = 0;
  }

  // ---- test/debug helpers (not part of the Sim contract) ----

  /** The Matter body of a live egg or ghost. */
  bodyOf(id: SimPlayerId): Matter.Body | undefined {
    return (this.eggs.get(id) ?? this.ghosts.get(id))?.body;
  }

  /** Base (unboosted) mass of a live egg. */
  originalMassOf(id: SimPlayerId): number | undefined {
    return this.eggs.get(id)?.originalMass;
  }

  /** Teleport a live egg or ghost, keeping its velocity. */
  place(id: SimPlayerId, x: number, y: number): void {
    const body = this.bodyOf(id);
    if (body) Body.setPosition(body, { x, y });
  }
}
