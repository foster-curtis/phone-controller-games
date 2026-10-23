// Ghost hazard (SPEC §6.2): a Matter sensor steered by force; either button starts a telegraphed
// pulse (wind-up, then a weak radial push on nearby eggs), then a cooldown. No charge: a held
// button is one press, because only counter increments start a pulse.
import Matter from 'matter-js';
import { SIM_CONFIG, msToSteps } from './config';
import type { Egg, Vec } from './egg';
import type { StepInput } from './inputs';
import type { GhostState, SimEvent, SimPlayerId } from './types';

const { Bodies } = Matter;
const G = SIM_CONFIG.ghost;

export const PULSE_WINDUP_STEPS = msToSteps(G.windupMs);
export const PULSE_COOLDOWN_STEPS = msToSteps(G.cooldownMs);
export const GHOST_SPAWN_STEPS = msToSteps(G.spawnDelayMs);

export class Ghost {
  readonly body: Matter.Body;
  readonly accel: Vec = { x: 0, y: 0 };
  readonly dv: Vec = { x: 0, y: 0 };
  /** Tick the current wind-up started; -1 = idle. */
  private windStart = -1;
  private readyAt = 0;

  constructor(
    readonly id: SimPlayerId,
    x: number,
    y: number,
  ) {
    this.body = Bodies.circle(x, y, G.radius, {
      label: `ghost:${id}`,
      isSensor: true,
      frictionAir: G.frictionAir,
      inertia: Infinity,
    });
  }

  /** §8 step 1. */
  applyInput(input: StepInput, tick: number): void {
    this.accel.x += input.sx * G.accel;
    this.accel.y += input.sy * G.accel;
    const pressed = input.dashPressed || input.slamPressed;
    if (pressed && this.windStart < 0 && tick >= this.readyAt) this.windStart = tick;
  }

  /** §8 step 2: finish a wind-up → push every egg in range away from the ghost. */
  updateTimers(tick: number, eggs: Iterable<Egg>, events: SimEvent[]): void {
    if (this.windStart < 0 || tick < this.windStart + PULSE_WINDUP_STEPS) return;
    this.windStart = -1;
    this.readyAt = tick + PULSE_COOLDOWN_STEPS;
    const { x: gx, y: gy } = this.body.position;
    for (const egg of eggs) {
      const dx = egg.body.position.x - gx;
      const dy = egg.body.position.y - gy;
      const d = Math.hypot(dx, dy);
      if (d > G.pulseRadius) continue;
      const nx = d > 1e-6 ? dx / d : 1;
      const ny = d > 1e-6 ? dy / d : 0;
      // Pure impulse: never touches last-touch (SPEC §6.2).
      egg.dv.x += nx * G.pulseDv;
      egg.dv.y += ny * G.pulseDv;
    }
    events.push({ type: 'pulse', id: this.id });
  }

  clearForces(): void {
    this.accel.x = this.accel.y = this.dv.x = this.dv.y = 0;
  }

  snapshot(tick: number): GhostState {
    return {
      id: this.id,
      x: this.body.position.x,
      y: this.body.position.y,
      windup: this.windStart < 0 ? 0 : (tick - this.windStart + 1) / PULSE_WINDUP_STEPS,
      cooldown: Math.max(0, this.readyAt - tick) / PULSE_COOLDOWN_STEPS,
    };
  }
}
