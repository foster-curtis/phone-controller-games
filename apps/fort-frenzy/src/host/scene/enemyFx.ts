// Enemy looks the clips can't carry (SPEC §9.6; FF10): enemy glow is baked into the part art (no
// emissive parts), so the tells' flares (Brute furnace, Bombard and Wasp muzzle charge, Stalker
// eyes) and the Skitter's core throb are violet glows drawn at the rig's attach points on the
// effects layer, where the bloom picks them up. Enemy shots leave from the weapon (C2 note 2): the
// drawn shell or stinger shot starts at the `muzzle` and eases onto the sim's path over its flight.
// The Stalker flashes its new quarry's color at its feet (C3). Pure helpers are exported for tests; `drawGlow` takes a Phaser Graphics.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import type { Pos } from './shot';

/** Where each rig's tell glows, and how big (sprite units). */
export const TELL_GLOW: Readonly<Record<string, { at: 'muzzle' | 'chest' | 'eyes'; r: number }>> = {
  brute: { at: 'chest', r: 16 },
  bombard: { at: 'muzzle', r: 12 },
  wasp: { at: 'muzzle', r: 8 },
  stalker: { at: 'eyes', r: 7 },
};

/** A wind-up's glow level at `ageMs` into it: ramps up, peaks at the release, then gone. */
export function chargeLevel(ageMs: number, windupMs: number): number {
  if (windupMs <= 0 || ageMs < 0 || ageMs > windupMs + 80) return 0;
  if (ageMs >= windupMs) return 1 - (ageMs - windupMs) / 80;
  const u = ageMs / windupMs;
  return u * u * (3 - 2 * u);
}

/**
 * The Stalker's target flash (C3, FF10-fix-1, §9.6): on each new quarry, the quarry's player color
 * flashes as a ring at the Stalker's feet for `HUNT_FLASH_MS`, then nothing until the next change.
 */
export const HUNT_FLASH_MS = 2000;
/** Flashes during the window. */
const HUNT_FLASHES = 4;
/** The last part of the window fades out, ms. */
const HUNT_FADE_MS = 500;

/** The flash level `ageMs` after the Stalker took its quarry: pulsing, fading out, then 0. */
export function huntFlashLevel(ageMs: number): number {
  if (ageMs < 0 || ageMs >= HUNT_FLASH_MS) return 0;
  const u = ageMs / HUNT_FLASH_MS;
  const pulse = 0.6 + 0.4 * Math.cos(2 * Math.PI * HUNT_FLASHES * u);
  const fade = Math.min(1, (HUNT_FLASH_MS - ageMs) / HUNT_FADE_MS);
  return pulse * fade;
}

/** Skitter core throb rate (Hz) by distance to the Citadel (tiles): faster as it nears (§9.6). */
export const PULSE_FAR = { d: 16, hz: 0.8 };
export const PULSE_NEAR = { d: 1, hz: 5 };
export function pulseHz(distTiles: number): number {
  const u = Math.min(1, Math.max(0, (PULSE_FAR.d - distTiles) / (PULSE_FAR.d - PULSE_NEAR.d)));
  return PULSE_FAR.hz + (PULSE_NEAR.hz - PULSE_FAR.hz) * u * u;
}

/** Throb level for an accumulated phase (cycles): a sharp beat, never fully dark. */
export function pulseLevel(phase: number): number {
  const f = phase - Math.floor(phase);
  return 0.25 + 0.75 * Math.pow(1 - f, 3);
}

export interface EnemyShot {
  /** The muzzle at launch as a world point with height (shot.ts `anchorToWorld`). */
  origin: Pos;
  /** The shooter's feet at launch (the sim's start point). */
  from: { x: number; y: number };
  bornMs: number;
  flightMs: number;
  /** Height the shot ends at (straight shots: a body's middle; shells: the ground). */
  endZ: number;
}

/** Where to draw an enemy shot: the muzzle offset fades out over the flight, onto the sim path. */
export function enemyShotPos(s: EnemyShot, nowMs: number, sim: Pos): Pos {
  const u = Math.min(1, Math.max(0, (nowMs - s.bornMs) / Math.max(1, s.flightMs)));
  const k = 1 - u;
  return {
    x: sim.x + (s.origin.x - s.from.x) * k,
    y: sim.y + (s.origin.y - s.from.y) * k,
    z: sim.z + s.origin.z * k + s.endZ * u,
  };
}

/** A violet glow at a screen point: a soft halo and a bright core, `level` 0..1+. */
export function drawGlow(
  g: Phaser.GameObjects.Graphics,
  sx: number,
  sy: number,
  rPx: number,
  level: number,
) {
  if (level <= 0.01) return;
  g.fillStyle(theme.color.hostile.num, 0.22 * Math.min(1, level));
  g.fillCircle(sx, sy, rPx * (1 + 0.6 * level));
  g.fillStyle(theme.color.hostileCore.num, 0.85 * Math.min(1, level));
  g.fillCircle(sx, sy, rPx * 0.45 * (0.6 + 0.4 * level));
}
