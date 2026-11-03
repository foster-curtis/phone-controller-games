// Pure pieces of the support classes' TV drawing (SPEC §2.4; FF9), tested headless: where a knight's
// shots leave from, the thrown cell's arc from the hand to the receiver's carry point, the morale
// aura's fade, and the Field Medic circle's dots.
import type { ScreenPoint } from '../render/types';

/**
 * Immediate-mode drawing that costs nothing while unused (FF7-fix-1's rule: no per-frame GPU work
 * while nothing changes): the graphics object is made on the first draw, and cleared at the next
 * frame's `begin` only if something was drawn since.
 */
export class Scratch<G extends { clear(): unknown; destroy(): void }> {
  private g: G | null = null;
  private dirty = false;

  constructor(private readonly make: () => G) {}

  /** Starts a frame: clears what the last frame drew. */
  begin(): void {
    if (this.dirty) this.g!.clear();
    this.dirty = false;
  }

  /** The graphics to draw on this frame. */
  draw(): G {
    this.g ??= this.make();
    this.dirty = true;
    return this.g;
  }

  destroy(): void {
    this.g?.destroy();
    this.g = null;
  }
}

/** The rig attach point a knight's projectiles leave from (C2: from the weapon, never the feet). */
export function shotAnchor(rigId: string): string {
  return rigId === 'artificer' ? 'lens' : 'bolt';
}

/** The thrown cell's arc height at mid-flight, px per tile thrown (at least `MIN_PEAK_PX`). */
export const PEAK_PX_PER_TILE = 14;
export const MIN_PEAK_PX = 40;

export interface ArcPoint {
  /** The cell. */
  sx: number;
  sy: number;
  /** Its ground shadow. */
  shadowSx: number;
  shadowSy: number;
  /** Height above the shadow's line, px (shadow shrinks with it). */
  lift: number;
}

/**
 * A lob from the hand (`from`, over the thrower's feet `fromFoot`) to the receiver's carry point
 * (`to`, over `toFoot`) at progress `u` (0..1): a parabola `peakPx` high over the straight line,
 * landing exactly on `to`. The shadow runs along the ground between the feet.
 */
export function throwArc(
  from: ScreenPoint,
  fromFoot: ScreenPoint,
  to: ScreenPoint,
  toFoot: ScreenPoint,
  u: number,
  peakPx: number,
): ArcPoint {
  const k = Math.min(1, Math.max(0, u));
  const up = 4 * peakPx * k * (1 - k);
  const lx = from.sx + (to.sx - from.sx) * k;
  const ly = from.sy + (to.sy - from.sy) * k;
  const fx = fromFoot.sx + (toFoot.sx - fromFoot.sx) * k;
  const fy = fromFoot.sy + (toFoot.sy - fromFoot.sy) * k;
  return { sx: lx, sy: ly - up, shadowSx: fx, shadowSy: fy, lift: fy - (ly - up) };
}

/**
 * Flight progress at `elapsedMs` since the throw: the cell stays in the hand until the clip's
 * release, then flies for the rest of the flight.
 */
export function throwProgress(elapsedMs: number, flightMs: number, releaseMs: number): number {
  if (elapsedMs <= releaseMs) return 0;
  const span = Math.max(1, flightMs - releaseMs);
  return Math.min(1, (elapsedMs - releaseMs) / span);
}

/** The morale aura's alpha: full when cast, fading to nothing as the buff runs out (its timer). */
export function moraleAlpha(remainingMs: number, totalMs: number, peak = 0.32): number {
  if (remainingMs <= 0 || totalMs <= 0) return 0;
  return peak * Math.min(1, remainingMs / totalMs);
}

/** Angles (radians) of the Field Medic circle's dots: `n` evenly spaced, slowly turning. */
export function dottedAngles(n: number, tMs: number, turnHz = 0.05): number[] {
  const off = tMs * 0.001 * turnHz * Math.PI * 2;
  return Array.from({ length: n }, (_, i) => off + (i / n) * Math.PI * 2);
}
