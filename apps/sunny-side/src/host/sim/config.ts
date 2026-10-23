// Sim tuning constants (never frozen; checkpoints tune them). Human units: px, px/s, px/s², ms.
// The sim converts them to Matter units in one place (world.ts), so `applyForce`'s dependence on
// the timestep never leaks into these numbers.

/** One fixed step (SPEC §8). */
export const STEP_MS = 1000 / 60;

/** ms → whole fixed steps (timers are tick-based so they're exact and deterministic). */
export function msToSteps(ms: number): number {
  return Math.max(1, Math.round(ms / STEP_MS));
}

export const SIM_CONFIG = {
  /** Matter sub-steps per fixed step (tunneling guard: 2 × 1000/120 ms). */
  substeps: 2,

  egg: {
    radius: 36,
    /** Matter default density; mass = density × area (~4.07). */
    density: 0.001,
    /** Main feel knob: per-1/60 s velocity damping. */
    frictionAir: 0.06,
    restitution: 0.8,
    friction: 0,
    /** Eggs spawn on a ring at this fraction of the start radius. */
    spawnRing: 0.55,
  },

  steer: {
    /** Full-stick acceleration. Terminal speed ≈ accel / (60 × frictionAir) = 300 px/s. */
    accel: 1080,
    /** Steering force multiplier while charging a slam. */
    chargingFactor: 0.35,
  },

  dash: {
    /** Instant Δv (impulse / mass). */
    dv: 1200,
    cooldownMs: 1500,
  },

  slam: {
    maxChargeMs: 1000,
    /** Release Δv at zero charge and at full charge (linear in between). */
    minDv: 700,
    maxDv: 2000,
    /** Mass multiplier for the post-release boost. */
    massBoost: 3,
    massBoostMs: 300,
  },

  ghost: {
    radius: 28,
    frictionAir: 0.08,
    /** Terminal speed ≈ accel / (60 × frictionAir) = 300 px/s. */
    accel: 1440,
    windupMs: 400,
    cooldownMs: 4000,
    /** Eggs whose center is within this distance of the ghost's center get pushed. */
    pulseRadius: 170,
    /** ≈ ⅓ of a dash. */
    pulseDv: 1200 / 3,
    spawnDelayMs: 5000,
  },

  arena: {
    /** Start radius = radiusPerSqrtN × √n (constant pan area per egg). */
    radiusPerSqrtN: 180,
    /** Minimum radius as a fraction of the start radius. */
    minRadiusFactor: 0.4,
    /** Full size for this long, then the shrink starts (and `shrinking` turns on). */
    holdMs: 10_000,
    /** Linear shrink duration from start to minimum radius. */
    shrinkMs: 45_000,
  },

  lastTouch: {
    /** Knockout credit window. */
    windowMs: 3000,
  },
} as const;
