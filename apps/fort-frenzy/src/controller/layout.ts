// Combat layout (SPEC §10.1, §15.7): a pure function from the viewport and safe-area insets to the
// stick and button circles, in viewport px. Percentages apply inside the safe area, so every offset is
// "added to env(safe-area-inset-*)"; fixed sizes stay in px. The bottom offset is clamped so no button
// edge is closer than 64 px to the right or bottom (a 300 px high phone would break it otherwise).
import type { SafeInsets } from '@pcg/controller-kit';

export interface Circle {
  /** Center, viewport px. */
  cx: number;
  cy: number;
  /** Diameter. */
  d: number;
}

export interface CombatLayout {
  stick: Circle;
  main: Circle;
  super: Circle;
  action: Circle;
}

export const STICK_BASE_D = 120;
export const STICK_KNOB_D = 52;
export const MAIN_D = 96;
export const SUPER_D = 76;
export const ACTION_D = 56;
export const MIN_EDGE = 64;
export const MIN_GAP = 24;
/** A button's touch target extends this far beyond its drawn edge. */
export const HIT_EXTRA = 8;

const SUPER_OFFSET = { x: -92, y: -78 } as const;
const ACTION_OFFSET = { x: -118, y: 20 } as const;

export const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function layoutCombat(
  viewport: { width: number; height: number },
  insets: SafeInsets = NO_INSETS,
): CombatLayout {
  const left = insets.left;
  const right = viewport.width - insets.right;
  const bottom = viewport.height - insets.bottom;
  const w = right - left;
  const h = bottom - insets.top;

  // Main button: 20% of the width from the right, 32% of the height up. The action button sits 20 px
  // lower than main, so the lowest edge is the action button's: keep it 64 px above the bottom.
  const mainFromRight = Math.max(0.2 * w, MIN_EDGE + MAIN_D / 2);
  const lowest = Math.max(MAIN_D / 2, ACTION_D / 2 + ACTION_OFFSET.y);
  const mainFromBottom = Math.max(0.32 * h, MIN_EDGE + lowest);
  const main: Circle = { cx: right - mainFromRight, cy: bottom - mainFromBottom, d: MAIN_D };

  return {
    stick: { cx: left + 0.17 * w, cy: bottom - 0.3 * h, d: STICK_BASE_D },
    main,
    super: { cx: main.cx + SUPER_OFFSET.x, cy: main.cy + SUPER_OFFSET.y, d: SUPER_D },
    action: { cx: main.cx + ACTION_OFFSET.x, cy: main.cy + ACTION_OFFSET.y, d: ACTION_D },
  };
}

/** Gap between two circles' edges, px. */
export function gapBetween(a: Circle, b: Circle): number {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy) - a.d / 2 - b.d / 2;
}
