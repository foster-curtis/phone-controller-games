// Enemy looks the clips can't carry (SPEC §9.6; FF10): enemy glow is baked into the part art (no
// emissive parts), so the tells' flares (Brute furnace, Bombard and Wasp muzzle charge, Stalker
// eyes) and the Skitter's core throb are violet glows drawn at the rig's attach points on the
// effects layer, where the bloom picks them up. Enemy shots leave from the weapon (C2 note 2): the
// drawn shell or stinger shot starts at the `muzzle` and eases onto the sim's path over its flight.
// The Stalker flashes its quarry's color at the quarry's feet when it locks on (C3, RD10); the Brute
// marks the build it locks on to (RD10). Pure helpers are exported for tests; `drawGlow` takes a
// Phaser Graphics.
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
 * The Stalker's lock-on flash (C3, RD10, §9.6): when it locks on, the quarry's player color flashes
 * as a ring at the quarry's feet for `HUNT_FLASH_MS`, then nothing until it locks on again.
 */
export const HUNT_FLASH_MS = 2000;
/** Flashes during the window. */
const HUNT_FLASHES = 4;
/** The last part of the window fades out, ms. */
const HUNT_FADE_MS = 500;

/** The flash level `ageMs` after the Stalker locked on: pulsing, fading out, then 0. */
export function huntFlashLevel(ageMs: number): number {
  if (ageMs < 0 || ageMs >= HUNT_FLASH_MS) return 0;
  const u = ageMs / HUNT_FLASH_MS;
  const pulse = 0.6 + 0.4 * Math.cos(2 * Math.PI * HUNT_FLASHES * u);
  const fade = Math.min(1, (HUNT_FLASH_MS - ageMs) / HUNT_FADE_MS);
  return pulse * fade;
}

/** The Brute's lock-on cue on the build (§7.5, §9.6), ms. */
export const BRUTE_CUE_MS = 900;
/** `brute-target`'s ring radius in sprite units (art README), and sprite units per tile. */
const BRUTE_RING_R = 24;
const UNITS_PER_TILE = 80;
/** How high each build's art stands (sprite units), for the arrow's tip just above it. */
const BUILD_TOP: Readonly<Record<string, number>> = { shield_gen: 50, beacon: 60 };
const BUILD_TOP_DEFAULT = 56;
const ARROW_GAP = 6;

/** Scale that fits `brute-target`'s ring to a build's footprint (never below the art's size). */
export function bruteCueScale(bodyRadius: number): number {
  return Math.max(1, (bodyRadius * UNITS_PER_TILE) / BRUTE_RING_R);
}

/** How far above a build's ground point the arrow's tip goes, sprite units. */
export function bruteArrowLift(kind: string): number {
  return (BUILD_TOP[kind] ?? BUILD_TOP_DEFAULT) + ARROW_GAP;
}

/**
 * The Charge's lane as a ground quad filled to `u` of its length: start left, start right, end
 * right, end left (world tiles). `r` is the reach to each side of the center line.
 */
export function laneQuad(
  m: { x: number; y: number; x2: number; y2: number; r: number },
  u: number,
): [number, number, number, number, number, number, number, number] {
  const dx = m.x2 - m.x;
  const dy = m.y2 - m.y;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = (-dy / l) * m.r;
  const ny = (dx / l) * m.r;
  const ex = m.x + dx * u;
  const ey = m.y + dy * u;
  return [m.x + nx, m.y + ny, m.x - nx, m.y - ny, ex - nx, ey - ny, ex + nx, ey + ny];
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
