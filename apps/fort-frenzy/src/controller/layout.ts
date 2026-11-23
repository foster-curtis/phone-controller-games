// Combat layout (SPEC §10.1, §15.7): a pure function from the viewport and safe-area insets to the
// stick and button circles, in viewport px. Percentages apply inside the safe area, so every offset is
// "added to env(safe-area-inset-*)"; fixed sizes stay in px. The build button is 60 px (RD4-fix-1 #115, was
// 68; pre-RD4 56) at (-134, +24), clear of the super's label. The bottom offset is clamped so no button
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
export const ACTION_D = 60;
export const MIN_EDGE = 64;
export const MIN_GAP = 24;
/** A button's touch target extends this far beyond its drawn edge. */
export const HIT_EXTRA = 8;

const SUPER_OFFSET = { x: -92, y: -78 } as const;
const ACTION_OFFSET = { x: -134, y: 24 } as const;

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

// ---- labels (RD4-fix-1, SPEC §10.1) --------------------------------------------------------------
// Each button's caption sits centered under it, clear of the dashed aim ring / meter ring that reach
// `RING_REACH` past the face. `layout.test.ts` proves no label meets any button or other label.

/** How far a ring (aim ring, charge ring) reaches past a button's drawn edge. */
export const RING_REACH = 11;
/** Gap between that ring and the label's top. */
export const LABEL_GAP = 3;
export const LABEL_H = 12;
/** Caption width: 12 px mono at 0.16em tracking is ~9.1 px a letter; padded 2 px each side. */
export const LABEL_CHAR_W = 9.12;
export const LABELS = { main: 'ATTACK', super: 'SUPER', action: 'BUILD' } as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Offset from the button's center to the label's top edge (CSS `.round-label` uses the same sum). */
export const labelTop = (d: number): number => d / 2 + RING_REACH + LABEL_GAP;

export function labelRect(c: Circle, text: string): Rect {
  const w = text.length * LABEL_CHAR_W + 4;
  return { x: c.cx - w / 2, y: c.cy + labelTop(c.d), w, h: LABEL_H };
}

/** Whether a rectangle meets a circle grown by `grow` px. */
export function rectHitsCircle(r: Rect, c: Circle, grow = 0): boolean {
  const nx = Math.max(r.x, Math.min(c.cx, r.x + r.w));
  const ny = Math.max(r.y, Math.min(c.cy, r.y + r.h));
  return Math.hypot(c.cx - nx, c.cy - ny) < c.d / 2 + grow;
}

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Gap between two circles' edges, px. */
export function gapBetween(a: Circle, b: Circle): number {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy) - a.d / 2 - b.d / 2;
}

// ---- touch zones (FF4-fix-2) ---------------------------------------------------------------------
// Aimed attack buttons are semi-floating joysticks: a finger landing anywhere on the right half picks
// the button whose drawn edge is nearest (the bounds between buttons), and the joystick centers on the
// finger. Tap buttons keep their fixed circles; a touch that lands in their zone is theirs.

export type ZoneKey = 'main' | 'super' | 'action';
export const ZONE_KEYS: readonly ZoneKey[] = ['main', 'super', 'action'];
/** A touch farther than this from every button's drawn edge picks nothing (a stray thumb). */
export const ZONE_REACH = 56;

/** Which button a touch at (x, y) belongs to, or null when it is out of reach of all of them. */
export function pickZone(layout: CombatLayout, x: number, y: number): ZoneKey | null {
  let best: ZoneKey | null = null;
  let bestEdge = Infinity;
  for (const key of ZONE_KEYS) {
    const c = layout[key];
    const edge = Math.hypot(x - c.cx, y - c.cy) - c.d / 2;
    if (edge < bestEdge) {
      bestEdge = edge;
      best = key;
    }
  }
  return bestEdge <= ZONE_REACH ? best : null;
}
