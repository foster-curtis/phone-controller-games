// Headless simulation contract (standalone matter-js; no Phaser, no networking). Frozen at F0:
// additive changes only. SimSnapshot field meanings freeze at F2 (M4 merged).
//
// World space: origin at the arena center, units = logical px of the 1920×1080 host canvas, +y down.
// One `step()` advances exactly 1/60 s (SPEC §8); the host loop (src/host/loop) owns the accumulator.
// Angles are radians, 0 = +x, increasing clockwise on screen (because +y is down). Velocities px/s.
// Stick input uses the same axes: +x right, +y down.
import type { Difficulty, InputTuple } from '../../shared/messages';

/** Eggs and ghosts are keyed by the owning player's id. */
export type SimPlayerId = string;

export interface EggSpawn {
  id: SimPlayerId;
  /** Frozen eggs ignore input and stay put but remain hittable (countdown, self-pause, disconnect). */
  frozen: boolean;
}

export interface EggState {
  id: SimPlayerId;
  x: number;
  y: number;
  /** Facing (radians): the last non-zero stick direction. Eggs never spin physically. */
  angle: number;
  /** Velocity, px/s. */
  vx: number;
  vy: number;
  /** Collision radius, px. */
  radius: number;
  /** Ignoring input (countdown, self-pause, disconnect); still hittable and can ring out. */
  frozen: boolean;
  /** 0..1 slam charge while SLAM is held (linear over the max charge time), else 0. */
  slamCharge: number;
  /** Post-slam mass boost active. */
  massBoost: boolean;
  /** 0..1 fraction of the dash cooldown remaining (0 = ready). */
  dashCooldown: number;
  /** Still charging and the charge is full (`slamCharge === 1`): the max-charge flash. */
  slamMax: boolean;
}

export interface GhostState {
  id: SimPlayerId;
  x: number;
  y: number;
  /** 0..1 pulse wind-up (telegraph ring), 0 when idle; > 0 for exactly the wind-up time. */
  windup: number;
  /** 0..1 fraction of the pulse cooldown remaining (0 = ready). */
  cooldown: number;
}

export interface SimSnapshot {
  /** Steps since `startRound` (0 right after it). */
  tick: number;
  arena: {
    /** Current rim radius, px. An egg is out once its center is farther than this from (0, 0). */
    radius: number;
    /** Radius at round start (∝ √players). */
    startRadius: number;
    /**
     * The arena is currently shrinking (HUD shrink warning / edge pulse): false for the first 10 s,
     * true during the linear shrink, false again once it holds at the minimum.
     */
    shrinking: boolean;
  };
  /** Eggs still on the pan. */
  eggs: EggState[];
  ghosts: GhostState[];
}

export type SimEvent =
  /**
   * An egg's center crossed the rim. `by` = last toucher within the credit window, else null.
   * `byGhost` (M4-fix-2) = no egg credit (`by` null) and a ghost pulse pushed this egg within the
   * same 3 s credit window ("Knocked out by ghost"); egg credit always wins, so it is false whenever
   * `by` is set. Scoring ignores it. Optional only so hand-built events still type-check; the sim
   * always sets it.
   */
  | {
      type: 'eliminated';
      id: SimPlayerId;
      by: SimPlayerId | null;
      byGhost?: boolean;
      respawnMs: number;
    }
  | { type: 'ghostSpawned'; id: SimPlayerId }
  | { type: 'dash'; id: SimPlayerId }
  /** SLAM released; `charge` 0..1, `max` = fully charged (flash). */
  | { type: 'slam'; id: SimPlayerId; charge: number; max: boolean }
  | { type: 'pulse'; id: SimPlayerId }
  /** Egg–egg contact start; `speed` = relative speed (for jiggle / impact effects). */
  | { type: 'collision'; a: SimPlayerId; b: SimPlayerId; speed: number }
  | { type: 'shrinkStart' };

export interface Sim {
  /**
   * Reset the world and place one egg per spawn (arena radius ∝ √n, scaled by `difficulty`, default
   * hard). Ghosts are cleared.
   */
  startRound(eggs: readonly EggSpawn[], opts?: RoundOptions): void;
  /** Freeze or unfreeze one egg; freezing stops it dead. No-op for unknown ids. */
  setFrozen(id: SimPlayerId, frozen: boolean): void;
  /**
   * Latest input record for an egg or ghost; `null` zeroes it. Read at the start of each step.
   * `startRound` forgets every record: the first sample of a round only baselines the press
   * counters (presses made while the host wasn't forwarding input never fire).
   */
  setInput(id: SimPlayerId, input: InputTuple | null): void;
  /**
   * M4-fix-2: remove this player's egg and ghost from the world at once (Leave / host removal): no
   * `eliminated` event, no credit, no ghost spawn (a pending one is cancelled), gone from the next
   * snapshot, input record dropped. Idempotent; no-op for unknown ids; a call during `step()` takes
   * effect at the end of that step. Optional only so existing wrappers/fakes still type-check; the
   * real sim (`createSim`) always implements it.
   */
  removeEgg?(id: SimPlayerId): void;
  /** Advance one fixed 1/60 s step; returns the events that step produced. */
  step(): SimEvent[];
  /** A fresh copy of the current state (safe to keep as `prev` for interpolation). */
  snapshot(): SimSnapshot;
  destroy(): void;
}

export interface RoundOptions {
  /** Pan size: easy/medium start bigger than hard. */
  difficulty?: Difficulty;
}

export interface SimOptions {
  /** Seed for spawn placement and any other randomness (determinism tests). */
  seed?: number;
}

/** `createSim(opts?: SimOptions): Sim` — implemented in ./index (M4). */
export { createSim } from './index';
