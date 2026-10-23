// Headless simulation contract (standalone matter-js; no Phaser, no networking). Frozen at F0:
// additive changes only. SimSnapshot field meanings freeze at F2 (M4 merged).
//
// World space: origin at the arena center, units = logical px of the 1920×1080 host canvas, +y down.
// One `step()` advances exactly 1/60 s (SPEC §8); the host loop (src/host/loop) owns the accumulator.
import type { InputTuple } from '../../shared/messages';

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
  /** radians */
  angle: number;
  vx: number;
  vy: number;
  radius: number;
  frozen: boolean;
  /** 0..1 slam charge while SLAM is held, else 0. */
  slamCharge: number;
  /** Post-slam mass boost active. */
  massBoost: boolean;
  /** 0..1 fraction of the dash cooldown remaining (0 = ready). */
  dashCooldown: number;
}

export interface GhostState {
  id: SimPlayerId;
  x: number;
  y: number;
  /** 0..1 pulse wind-up (telegraph), 0 when idle. */
  windup: number;
  /** 0..1 fraction of the pulse cooldown remaining (0 = ready). */
  cooldown: number;
}

export interface SimSnapshot {
  /** Steps since `startRound`. */
  tick: number;
  arena: {
    radius: number;
    /** Radius at round start. */
    startRadius: number;
    /** The arena is currently shrinking (HUD shrink warning). */
    shrinking: boolean;
  };
  /** Eggs still on the pan. */
  eggs: EggState[];
  ghosts: GhostState[];
}

export type SimEvent =
  /** An egg's center crossed the rim. `by` = last toucher within the credit window, else null. */
  | { type: 'eliminated'; id: SimPlayerId; by: SimPlayerId | null; respawnMs: number }
  | { type: 'ghostSpawned'; id: SimPlayerId }
  | { type: 'dash'; id: SimPlayerId }
  /** SLAM released; `charge` 0..1, `max` = fully charged (flash). */
  | { type: 'slam'; id: SimPlayerId; charge: number; max: boolean }
  | { type: 'pulse'; id: SimPlayerId }
  /** Egg–egg contact start; `speed` = relative speed (for jiggle / impact effects). */
  | { type: 'collision'; a: SimPlayerId; b: SimPlayerId; speed: number }
  | { type: 'shrinkStart' };

export interface Sim {
  /** Reset the world and place one egg per spawn (arena radius ∝ √n). Ghosts are cleared. */
  startRound(eggs: readonly EggSpawn[]): void;
  /** Freeze or unfreeze one egg; freezing stops it dead. No-op for unknown ids. */
  setFrozen(id: SimPlayerId, frozen: boolean): void;
  /** Latest input record for an egg or ghost; `null` zeroes it. Read at the start of each step. */
  setInput(id: SimPlayerId, input: InputTuple | null): void;
  /** Advance one fixed 1/60 s step; returns the events that step produced. */
  step(): SimEvent[];
  /** A fresh copy of the current state (safe to keep as `prev` for interpolation). */
  snapshot(): SimSnapshot;
  destroy(): void;
}

export interface SimOptions {
  /** Seed for spawn placement and any other randomness (determinism tests). */
  seed?: number;
}

export function createSim(_opts: SimOptions = {}): Sim {
  throw new Error('createSim: not implemented (M4)');
}
