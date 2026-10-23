// Circular, shrinking pan (SPEC §6.1 Arena, §6.4 Ring-out / Shrink). Pure functions of the tick.
import { SIM_CONFIG, msToSteps } from './config';

const A = SIM_CONFIG.arena;
export const HOLD_STEPS = msToSteps(A.holdMs);
export const SHRINK_STEPS = msToSteps(A.shrinkMs);

/** Start radius ∝ √n (constant area per egg); strictly increasing in n. */
export function startRadiusFor(playerCount: number): number {
  return A.radiusPerSqrtN * Math.sqrt(Math.max(1, playerCount));
}

export function minRadiusFor(startRadius: number): number {
  return startRadius * A.minRadiusFactor;
}

export interface ArenaPhase {
  radius: number;
  /** Inside the linear shrink (HUD warning / edge pulse). */
  shrinking: boolean;
}

/** Full size through `HOLD_STEPS`, then linear to the minimum over `SHRINK_STEPS`, then hold. */
export function arenaAt(tick: number, startRadius: number): ArenaPhase {
  const min = minRadiusFor(startRadius);
  if (tick <= HOLD_STEPS) return { radius: startRadius, shrinking: false };
  const t = (tick - HOLD_STEPS) / SHRINK_STEPS;
  if (t >= 1) return { radius: min, shrinking: false };
  return { radius: startRadius + (min - startRadius) * t, shrinking: true };
}

/** Ring-out: only the body's **center** crossing the rim counts. */
export function isRingOut(x: number, y: number, radius: number): boolean {
  return Math.hypot(x, y) > radius;
}

export interface SpawnPoint {
  x: number;
  y: number;
  /** Facing (radians), pointing at the arena center. */
  facing: number;
}

/** Evenly spaced spawn points on a ring, rotated by `offset` radians. */
export function spawnPoints(count: number, startRadius: number, offset: number): SpawnPoint[] {
  const ring = startRadius * SIM_CONFIG.egg.spawnRing;
  const out: SpawnPoint[] = [];
  for (let i = 0; i < count; i++) {
    const a = offset + (2 * Math.PI * i) / count;
    out.push({ x: Math.cos(a) * ring, y: Math.sin(a) * ring, facing: a + Math.PI });
  }
  return out;
}
