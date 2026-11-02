// The Artificer's backpack gauge (SPEC §2.4; C1 note 1): three cells that fill from the bottom cell
// up, two crates per cell, an odd count lighting the bottom half of the next cell; 6 or more crates
// show all three full (the cap is 8). The art numbers its cells from the top (`core1` is the top
// cell, `core3` the bottom), so the k-th cell from the bottom is `core(4 − k)` (BUILD_PLAN §8
// FF3-fix-1: this replaces the art README's "cell N full at ≥ 2N" order).

/** Bottom-to-top cell ids in the art's numbering. */
export const GAUGE_CELLS_BOTTOM_UP = [3, 2, 1] as const;

/** Optional groups to switch on for a crate count (0–8). */
export function gaugeGroups(crates: number): string[] {
  const out: string[] = [];
  GAUGE_CELLS_BOTTOM_UP.forEach((cell, i) => {
    const k = i + 1;
    if (crates >= 2 * k) out.push(`core${cell}-full`);
    else if (crates === 2 * k - 1) out.push(`core${cell}-half`);
  });
  return out;
}

/** Every gauge group (to switch off the ones a new count doesn't use). */
export const GAUGE_GROUPS = [1, 2, 3].flatMap((c) => [`core${c}-full`, `core${c}-half`]);
