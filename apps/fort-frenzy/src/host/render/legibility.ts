// Floor-legibility tweaks that came with the lighter C3 floor (BUILD_PLAN §8 FF3-fix-2), kept in one
// pure module so floor-contrast.test.ts checks the values the renderer draws with.

/** Ink (`brandInk`, opaque) edge on each side of a player ring and around its notch, px. */
export const RING_EDGE_PX = 1.5;

/** Ink edge on each side of a red danger marker's ring. */
export const DANGER_EDGE = { px: 1.5, alpha: 0.85 } as const;

/** The Stalker's target thread: `hostileCore` (pale violet) at this alpha (was `hostile` at 0.32). */
export const THREAD_ALPHA = 0.5;
