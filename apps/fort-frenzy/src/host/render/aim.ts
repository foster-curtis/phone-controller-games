// Facing and aim snapping (SPEC §2.4, §3.6, §7.2, §15.2). Angles are world-ground radians: x right,
// y down-field (toward the camera), so 90° faces the camera. Pre-rendered heads model a 3D head
// turning about the vertical axis, so they snap on the world angle, not the projected one.
import type { ViewId } from '../../themes/types';
import { SENTRY_AIMS, TURRET_AIMS, type SentryAim, type TurretAim } from './types';

const DEG = Math.PI / 180;
/** Aim frames switch only once the target is this far past a sector boundary (§15.2). */
export const AIM_HYSTERESIS_DEG = 8;
/** Facing switches axis only when the other axis is 15% stronger (§15.2). */
export const FACING_HYSTERESIS = 1.15;
/** Mortar tube clamp from straight up (§7.2). */
export const MORTAR_CLAMP_DEG = 75;

/** Signed smallest difference a − b in degrees, in (−180, 180]. */
export function angleDiffDeg(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Turret aim centers in degrees (e = 0, se = 45, s = 90 … ne = 315). */
const TURRET_DEG: Record<TurretAim, number> = Object.fromEntries(
  TURRET_AIMS.map((a, i) => [a, i * 45]),
) as Record<TurretAim, number>;

/**
 * Nearest of 8 aims, keeping `prev` until the angle is 8° past its sector edge (22.5° + 8° from its
 * center).
 */
export function snapTurretAim(angleRad: number, prev: TurretAim | null = null): TurretAim {
  const deg = angleRad / DEG;
  if (prev && Math.abs(angleDiffDeg(deg, TURRET_DEG[prev])) <= 22.5 + AIM_HYSTERESIS_DEG) return prev;
  const i = (((Math.round(deg / 45) % 8) + 8) % 8) as number;
  return TURRET_AIMS[i]!;
}

/** Sentry aims (§3.6) in degrees: r = 0 (right) … c = 90 (at camera) … l = 180 (left). */
const SENTRY_DEG: Record<SentryAim, number> = { r: 0, dr: 45, c: 90, dl: 135, l: 180 };

/** Nearest of the five sentry frames with the same hysteresis; targets up-screen clamp to l or r. */
export function snapSentryAim(angleRad: number, prev: SentryAim | null = null): SentryAim {
  let deg = angleRad / DEG;
  deg = ((deg % 360) + 360) % 360;
  if (deg > 180) deg = deg < 270 ? 180 : 0; // behind the wall line: the nearest side frame
  if (prev && Math.abs(deg - SENTRY_DEG[prev]) <= 22.5 + AIM_HYSTERESIS_DEG) return prev;
  let best: SentryAim = 'c';
  for (const a of SENTRY_AIMS) {
    if (Math.abs(deg - SENTRY_DEG[a]) < Math.abs(deg - SENTRY_DEG[best])) best = a;
  }
  return best;
}

/**
 * Mortar tube rotation in radians about the dome center, from straight up-screen (0) toward the
 * target's projected screen direction (sdx, sdy), clamped to ±75° so it always draws behind the dome.
 */
export function mortarTubeAngle(sdx: number, sdy: number): number {
  if (sdx === 0 && sdy === 0) return 0;
  const a = Math.atan2(sdx, -sdy);
  const lim = MORTAR_CLAMP_DEG * DEG;
  return Math.max(-lim, Math.min(lim, a));
}

export interface Facing {
  view: ViewId;
  /** Side view mirrored (facing left). */
  mirror: boolean;
}

/**
 * Knights and footmen pick the view from the stronger axis of (dx, dy) (aim while attacking, else
 * movement), switching axis only when the other is 15% stronger. A zero vector keeps `prev`.
 */
export function pickFacing(dx: number, dy: number, prev: Facing | null = null): Facing {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax === 0 && ay === 0) return prev ?? { view: 'front', mirror: false };
  const horizontal = !prev
    ? ax >= ay
    : prev.view === 'side'
      ? !(ay > ax * FACING_HYSTERESIS)
      : ax > ay * FACING_HYSTERESIS;
  if (horizontal) {
    // Keep the mirror when the horizontal component is exactly zero on a kept axis.
    return { view: 'side', mirror: dx < 0 || (dx === 0 && (prev?.mirror ?? false)) };
  }
  return { view: dy > 0 || (dy === 0 && prev?.view === 'front') ? 'front' : 'back', mirror: false };
}

/** Enemies use the side view only, mirrored for left (§2.4); Wasp drones mirror only. */
export function enemyMirror(dx: number, prev: boolean): boolean {
  return dx === 0 ? prev : dx < 0;
}
