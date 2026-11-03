// Structure state looks (SPEC §7.1, §7.2; FF8), pure so they are tested headless: the shock net's
// per-tile charge glow and discharge flash, the damaged glow flicker, the charged-wall crackle, the
// build sketch and fill, and the destroyed collapse. render/structures.ts and scene/structuresView.ts
// draw them with alpha, scale and crop only (no texture redraws per frame).
import { hash01 } from './fall';

/** A discharge flash on a net tile, ms. */
export const NET_FLASH_MS = 260;
/** Charges zigzag on a slow loop (§7.2), ms per cycle. */
export const NET_LOOP_MS = 2400;

/**
 * A net tile's alpha (§7.1: remaining discharges show as a dimming glow; each discharge flashes):
 * full charge 1, the last discharge left about half; while it rearms it dips; a flash peaks at 1.
 */
export function netAlpha(
  left: number,
  max: number,
  armed: boolean,
  tMs: number,
  flashAgeMs: number | null,
): number {
  const frac = max > 0 ? Math.max(0, Math.min(1, left / max)) : 0;
  const base = 0.38 + 0.62 * frac;
  const loop = 0.92 + 0.08 * Math.sin((tMs / NET_LOOP_MS) * Math.PI * 2);
  let a = base * loop * (armed ? 1 : 0.6);
  if (flashAgeMs !== null && flashAgeMs < NET_FLASH_MS) {
    const f = 1 - flashAgeMs / NET_FLASH_MS;
    a = Math.max(a, f);
  }
  return Math.min(1, a);
}

/** Below half HP the glow flickers (§7.2): mostly steady, with short irregular dips. */
export function damageFlicker(tMs: number, seed: number): number {
  const slot = Math.floor(tMs / 90);
  const r = hash01(`dmg:${seed}:${slot}`);
  return r < 0.18 ? 0.55 + r : 1;
}

/** Charged walls crackle on a quick, irregular flicker (§7.2). */
export function chargedFlicker(tMs: number, seed: number): number {
  const slot = Math.floor(tMs / 55);
  const r = hash01(`chg:${seed}:${slot}`);
  return r < 0.35 ? 0.15 + r : 0.75 + 0.25 * r;
}

/** The build (§7.2): an amber outline sketches the shape, then it fills from the plate up, ms. */
export const BUILD_FILL_MS = 640;
export const BUILD_SKETCH_END = 0.4;

export interface BuildPhase {
  /** Amber sketch alpha (the silhouette). */
  sketch: number;
  /** Fraction of the real frame shown, from the bottom (0 none, 1 whole). */
  fill: number;
  done: boolean;
}

export function buildPhase(tMs: number): BuildPhase {
  const u = Math.max(0, tMs / BUILD_FILL_MS);
  if (u >= 1) return { sketch: 0, fill: 1, done: true };
  if (u < BUILD_SKETCH_END)
    return { sketch: 0.2 + 0.6 * (u / BUILD_SKETCH_END), fill: 0, done: false };
  const k = (u - BUILD_SKETCH_END) / (1 - BUILD_SKETCH_END);
  return { sketch: 0.8 * (1 - k * k), fill: k, done: false };
}

/** Destroyed (§7.2): the glow is out; the structure sinks into its plate and fades into scrap, ms. */
export const COLLAPSE_MS = 380;

export function collapseAt(tMs: number): { sy: number; alpha: number; done: boolean } {
  const u = Math.min(1, Math.max(0, tMs / COLLAPSE_MS));
  return { sy: 1 - 0.7 * u * u, alpha: 1 - u, done: u >= 1 };
}

/** Fortify's dome ripples when it absorbs a hit (§7.2), ms; returns the dome's scale. */
export const RIPPLE_MS = 300;
export function rippleScale(ageMs: number): number {
  if (ageMs < 0 || ageMs >= RIPPLE_MS) return 1;
  const u = ageMs / RIPPLE_MS;
  return 1 + 0.07 * Math.sin(u * Math.PI * 3) * (1 - u);
}

/** Scrap size for a destroyed structure (3–5 are structure-sized, §15.2). */
export function structureScrap(kind: string): 3 | 4 | 5 {
  return kind === 'wall' ? 3 : kind === 'bomb_tower' ? 5 : 4;
}
