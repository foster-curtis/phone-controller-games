// The Artificer's backpack gauge is his build meter (SPEC §2.4; RD8): three cells that fill from the
// bottom cell up, two steps per cell, an odd count lighting the bottom half of the next cell. The art
// numbers its cells from the top (`core1` is the top cell, `core3` the bottom), so the k-th cell from
// the bottom is `core(4 − k)` (BUILD_PLAN §8 FF3-fix-1: this replaces the art README's "cell N full
// at ≥ 2N" order).

/** Bottom-to-top cell ids in the art's numbering. */
export const GAUGE_CELLS_BOTTOM_UP = [3, 2, 1] as const;

/** Half-cell steps in the gauge. */
export const GAUGE_STEPS = 6;

/** `k = floor(meter × 6)`; the epsilon keeps an exact sixth from reading as the step below it. */
export function gaugeSteps(meter: number): number {
  const m = Math.min(1, Math.max(0, meter));
  return Math.min(GAUGE_STEPS, Math.floor(m * GAUGE_STEPS + 1e-9));
}

/** Optional groups to switch on for a step count (0–6). */
export function gaugeGroups(steps: number): string[] {
  const out: string[] = [];
  GAUGE_CELLS_BOTTOM_UP.forEach((cell, i) => {
    const k = i + 1;
    if (steps >= 2 * k) out.push(`core${cell}-full`);
    else if (steps === 2 * k - 1) out.push(`core${cell}-half`);
  });
  return out;
}

/** Every gauge group (to switch off the ones a new count doesn't use). */
export const GAUGE_GROUPS = [1, 2, 3].flatMap((c) => [`core${c}-full`, `core${c}-half`]);
