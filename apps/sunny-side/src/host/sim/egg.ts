// A living egg (SPEC §6.4): force steering, facing, dash, slam charge/release, mass boost, freeze.
// Inputs only accumulate an acceleration and a Δv on the egg; world.ts turns them into Matter
// forces during the physics step. Velocity is never written directly except by `stopDead`.
import Matter from 'matter-js';
import { SIM_CONFIG, STEP_MS, msToSteps } from './config';
import type { StepInput } from './inputs';
import type { EggState, SimEvent, SimPlayerId } from './types';

const { Bodies, Body } = Matter;
const E = SIM_CONFIG.egg;
const S = SIM_CONFIG.slam;

export const DASH_COOLDOWN_STEPS = msToSteps(SIM_CONFIG.dash.cooldownMs);
export const SLAM_CHARGE_STEPS = msToSteps(S.maxChargeMs);
export const MASS_BOOST_STEPS = msToSteps(S.massBoostMs);

/** Matter velocity is px per base step (1000/60 ms); ×60 → px/s. */
const VELOCITY_TO_PX_S = 1000 / STEP_MS;

export interface Vec {
  x: number;
  y: number;
}

/** The disconnect/countdown freeze: the only direct velocity write in the sim (SPEC §6.4). */
export function stopDead(body: Matter.Body): void {
  Body.setVelocity(body, { x: 0, y: 0 });
}

/** Direction from the stick, or from `facing` when the stick is neutral. */
function aim(input: StepInput, facing: number): Vec {
  const mag = Math.hypot(input.sx, input.sy);
  if (mag > 0) return { x: input.sx / mag, y: input.sy / mag };
  return { x: Math.cos(facing), y: Math.sin(facing) };
}

export class Egg {
  readonly body: Matter.Body;
  /** Last non-zero stick direction (radians). */
  facing: number;
  frozen = false;
  /** This step's steering acceleration (px/s²) and instant Δv (px/s); cleared after physics. */
  readonly accel: Vec = { x: 0, y: 0 };
  readonly dv: Vec = { x: 0, y: 0 };

  private dashReadyAt = 0;
  private charging = false;
  private chargeSteps = 0;
  private readonly baseMass: number;
  /** Tick at which the mass boost ends; -1 = no boost. */
  private boostUntil = -1;

  constructor(
    readonly id: SimPlayerId,
    x: number,
    y: number,
    facing: number,
  ) {
    this.facing = facing;
    this.body = Bodies.circle(x, y, E.radius, {
      label: `egg:${id}`,
      density: E.density,
      frictionAir: E.frictionAir,
      restitution: E.restitution,
      friction: E.friction,
      frictionStatic: 0,
      // Eggs never spin; `angle` in the snapshot is the facing direction.
      inertia: Infinity,
    });
    this.baseMass = this.body.mass;
  }

  get charge(): number {
    return this.charging ? Math.min(this.chargeSteps / SLAM_CHARGE_STEPS, 1) : 0;
  }

  get massBoost(): boolean {
    return this.boostUntil >= 0;
  }

  /** Freezing stops the egg dead once and cancels a slam charge; it stays hittable. */
  setFrozen(frozen: boolean): void {
    if (frozen === this.frozen) return;
    this.frozen = frozen;
    if (frozen) {
      this.charging = false;
      this.chargeSteps = 0;
      stopDead(this.body);
    }
  }

  /** §8 step 1: steering force + dash/slam from counter diffs. Frozen eggs ignore input. */
  applyInput(input: StepInput, tick: number, events: SimEvent[]): void {
    if (this.frozen) return;
    if (input.sx !== 0 || input.sy !== 0) this.facing = Math.atan2(input.sy, input.sx);

    if (input.dashPressed && tick >= this.dashReadyAt) {
      const d = aim(input, this.facing);
      this.dv.x += d.x * SIM_CONFIG.dash.dv;
      this.dv.y += d.y * SIM_CONFIG.dash.dv;
      this.dashReadyAt = tick + DASH_COOLDOWN_STEPS;
      events.push({ type: 'dash', id: this.id });
    }

    // Slam: charge from a press, release when the button is seen up (or re-pressed in between).
    if (this.charging && (!input.slamHeld || input.slamPressed))
      this.releaseSlam(input, tick, events);
    if (input.slamPressed) {
      this.charging = true;
      this.chargeSteps = 0;
      if (!input.slamHeld) this.releaseSlam(input, tick, events);
    }

    const k = SIM_CONFIG.steer.accel * (this.charging ? SIM_CONFIG.steer.chargingFactor : 1);
    this.accel.x += input.sx * k;
    this.accel.y += input.sy * k;
  }

  private releaseSlam(input: StepInput, tick: number, events: SimEvent[]): void {
    const charge = this.charge;
    this.charging = false;
    this.chargeSteps = 0;
    const d = aim(input, this.facing);
    const dv = S.minDv + (S.maxDv - S.minDv) * charge;
    this.dv.x += d.x * dv;
    this.dv.y += d.y * dv;
    // Brief mass boost so the slammer wins the collision; never stacks, always restores baseMass.
    Body.setMass(this.body, this.baseMass * S.massBoost);
    this.boostUntil = tick + MASS_BOOST_STEPS;
    events.push({ type: 'slam', id: this.id, charge, max: charge >= 1 });
  }

  /** §8 step 2: slam charge and mass boost timers. */
  updateTimers(tick: number): void {
    if (this.charging) this.chargeSteps = Math.min(this.chargeSteps + 1, SLAM_CHARGE_STEPS);
    if (this.boostUntil >= 0 && tick >= this.boostUntil) {
      Body.setMass(this.body, this.baseMass);
      this.boostUntil = -1;
    }
  }

  clearForces(): void {
    this.accel.x = this.accel.y = this.dv.x = this.dv.y = 0;
  }

  /** Base (unboosted) mass. */
  get originalMass(): number {
    return this.baseMass;
  }

  snapshot(tick: number): EggState {
    const v = Body.getVelocity(this.body);
    const charge = this.charge;
    return {
      id: this.id,
      x: this.body.position.x,
      y: this.body.position.y,
      angle: this.facing,
      vx: v.x * VELOCITY_TO_PX_S,
      vy: v.y * VELOCITY_TO_PX_S,
      radius: E.radius,
      frozen: this.frozen,
      slamCharge: charge,
      slamMax: this.charging && charge >= 1,
      massBoost: this.massBoost,
      dashCooldown: Math.max(0, this.dashReadyAt - tick) / DASH_COOLDOWN_STEPS,
    };
  }
}
