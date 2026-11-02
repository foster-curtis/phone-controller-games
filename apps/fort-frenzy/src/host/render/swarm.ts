// Scrap-mite packs (SPEC §9.6; C1 note 3): each mite of a pack of 8 skitters on its own jittery
// path around its slot, at its own speed, with small stops and heading wobble, so the pack spreads,
// bunches and re-layers as it moves (mites draw y-sorted by their own foot point, so passing one
// another in depth swaps who is in front). Mixed sizes and tilts; every mite faces the pack's way.
// Seeded hashes, never a random source: a pack looks the same on every run. Pure TS.
import { tileHash } from './map';

export interface Mite {
  /** Home slot around the pack center, tiles. */
  hx: number;
  hy: number;
  /** Size factor (mixed sizes). */
  scale: number;
  /** Own clip speed and phase (never in step). */
  speed: number;
  offsetMs: number;
  /** Wander frequencies (Hz) and phases. */
  fx: number;
  fy: number;
  px: number;
  py: number;
  /** Stop cycle: period ms and the moving fraction of it. */
  periodMs: number;
  moving: number;
  stopPhase: number;
}

/** Pack spread around its center, tiles (x along the march, y across it). */
export const PACK_SPREAD = { x: 0.55, y: 0.38 };
/** Wander reach around each slot, tiles: wide enough that neighbors pass each other in depth. */
export const WANDER = { x: 0.3, y: 0.22 };
/** Heading wobble, radians either way (never backward). */
export const MAX_WOBBLE = 0.3;

const u01 = (seed: number, i: number, salt: number) => tileHash(seed, i, salt) / 0x100000000;

export function mitePack(seed: number, n = 8): Mite[] {
  return Array.from({ length: n }, (_, i) => {
    const r = (salt: number) => u01(seed, i, salt);
    return {
      hx: (r(1) * 2 - 1) * PACK_SPREAD.x,
      hy: (r(2) * 2 - 1) * PACK_SPREAD.y,
      scale: 0.8 + r(3) * 0.4,
      speed: 0.8 + r(4) * 0.45,
      offsetMs: Math.floor(r(5) * 500),
      fx: 0.35 + r(6) * 0.5,
      fy: 0.3 + r(7) * 0.5,
      px: r(8),
      py: r(9),
      periodMs: 1400 + Math.floor(r(10) * 1400),
      moving: 0.72 + r(11) * 0.18,
      stopPhase: r(12),
    };
  });
}

/** The mite's own clock: it advances only while the mite is moving (it pauses on stops). */
export function miteClock(m: Mite, tMs: number): { tau: number; moving: boolean } {
  const t = tMs + m.stopPhase * m.periodMs;
  const cycles = Math.floor(t / m.periodMs);
  const inCycle = t - cycles * m.periodMs;
  const run = m.moving * m.periodMs;
  return {
    tau: cycles * run + Math.min(inCycle, run) - m.stopPhase * run,
    moving: inCycle < run,
  };
}

/** Offset from the pack center (tiles) and heading wobble (radians) at time t while marching. */
export function mitePose(
  m: Mite,
  tMs: number,
): { dx: number; dy: number; wobble: number; moving: boolean } {
  const { tau, moving } = miteClock(m, tMs);
  const s = tau / 1000;
  const TAU = Math.PI * 2;
  const wx = Math.sin((s * m.fx + m.px) * TAU) + 0.4 * Math.sin((s * m.fx * 2.7 + m.py) * TAU);
  const wy = Math.sin((s * m.fy + m.py) * TAU) + 0.4 * Math.sin((s * m.fy * 3.1 + m.px) * TAU);
  // Heading follows the sideways drift, clamped so no mite ever turns around.
  const drift = Math.cos((s * m.fy + m.py) * TAU) * m.fy;
  return {
    dx: m.hx + (WANDER.x * wx) / 1.4,
    dy: m.hy + (WANDER.y * wy) / 1.4,
    wobble: Math.max(-MAX_WOBBLE, Math.min(MAX_WOBBLE, drift * 0.6)),
    moving,
  };
}
