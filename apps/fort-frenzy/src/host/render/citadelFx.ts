// Citadel animation curves (SPEC §3.6): the heavy smoke's drift and flicker (C1 note 7) and the
// destroyed transition (C1 note 8: core implodes, glow cuts out, the keep collapses into its
// footprint, ending on the rubble frame). Pure functions of time, so they're tested headless;
// render/structures.ts applies them.

/** One drifting copy of the smoke overlay, in sprite units and factors. */
export interface SmokeLayer {
  dx: number;
  dy: number;
  scale: number;
  alpha: number;
}

/** Rise period of a smoke copy, ms. */
export const SMOKE_PERIOD_MS = 2600;
/** Only the plumes drift: the copies are cropped above this y (Citadel units; the gate dimmer stays). */
export const SMOKE_CROP_Y = 160;

/** The base overlay's alpha: a slow breathing with a faster flicker over it. */
export function smokeBaseAlpha(tMs: number): number {
  return 0.82 + 0.1 * Math.sin(tMs / 430) + 0.06 * Math.sin(tMs / 117 + 1.3);
}

/**
 * Two copies of the plumes rise, swell and fade, half a period apart, so smoke keeps pouring up
 * off the keep next to the flickering fire.
 */
export function smokeLayers(tMs: number): [SmokeLayer, SmokeLayer] {
  const layer = (i: number): SmokeLayer => {
    const p = (tMs / SMOKE_PERIOD_MS + i / 2) % 1;
    return {
      dx: 4 * Math.sin((tMs / 2300 + i * 0.37) * Math.PI * 2),
      dy: -22 * p,
      scale: 1 + 0.1 * p,
      alpha: 0.6 * Math.sin(Math.PI * p),
    };
  };
  return [layer(0), layer(1)];
}

// ---- destroyed transition ------------------------------------------------------------------------

export const CITADEL_COLLAPSE_MS = 2400;

export interface CollapseFrame {
  /** Core sphere scale about its center, and alpha. */
  coreScale: number;
  coreAlpha: number;
  /** The glow layer's alpha (cuts out after the implosion). */
  glowAlpha: number;
  /** Swap the keep's frames to their unlit variants. */
  unlit: boolean;
  /** Keep height factor (sinking into the footprint) and alpha. */
  keepSy: number;
  keepAlpha: number;
  rubbleAlpha: number;
  /** Shake amplitude, screen px. */
  shake: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

/** Key times, ms. */
export const COLLAPSE_AT = { implode: 380, glowOut: 480, sinkStart: 520, sinkEnd: 1800 } as const;

export function citadelCollapseAt(tMs: number): CollapseFrame {
  const t = Math.max(0, tMs);
  const { implode, glowOut, sinkStart, sinkEnd } = COLLAPSE_AT;
  // Core: flares up, then implodes to a point.
  const flare = seg(t, 0, 140);
  const shrink = seg(t, 140, implode);
  const coreScale = t < 140 ? 1 + 0.3 * flare : 1.3 - 1.15 * shrink * shrink;
  const sink = seg(t, sinkStart, sinkEnd);
  return {
    coreScale,
    coreAlpha: t < implode ? 1 : 1 - seg(t, implode, glowOut),
    glowAlpha: 1 - seg(t, implode, glowOut),
    unlit: t >= implode,
    // Eases in: the keep gives way slowly, then drops.
    keepSy: 1 - 0.78 * sink * sink,
    keepAlpha: 1 - seg(t, 1400, 2000),
    rubbleAlpha: seg(t, 1100, 2000),
    shake: t < sinkStart ? 1.5 * flare : 3.5 * (1 - seg(t, sinkStart, CITADEL_COLLAPSE_MS)),
  };
}
