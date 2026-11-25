// The market map (SPEC §6.3, §12.4), as config: stall slots, lanes, alleys, end passages, entries,
// the top gate, the stocks, walkable areas, line-of-sight blockers and the guard patrol loop. Sim and
// render code read positions only from here (BUILD_PLAN §3 "Layout is config"). Units: tiles on the
// ground plane (48 px wide, ground factor 0.6, so 28.8 px deep on screen; SPEC §12.2). Positions come
// from `art/forum/map/market-layout-reference.svg` (640 × 360): ×3 to screen pixels, then x / 48 and
// y / 28.8. Starting values: TF1/TF7 nudge them to the rendered art.
import type { LayoutDef, Polygon, Rect, ShopId, StallSlotDef } from './types';

const W = 40;
const H = 37.5;

/** Top row: ground footprint rows 0 → 10.1, counter faces the upper lane. */
const TOP = { y0: 0, y1: 10.1, merchantCounterY: 8.1, merchantShelfY: 7.4 } as const;
/** Middle row: footprint 20.83 → 26.25, counter faces the lower lane. */
const MID = { y0: 20.83, y1: 26.25, merchantCounterY: 24.35, merchantShelfY: 23.69 } as const;

/** Customers stand this far in front of the counter (tiles). */
const CUSTOMER_GAP = 0.6;

function stall(
  id: number,
  shop: ShopId,
  row: 'top' | 'middle',
  x: number,
  w: number,
): StallSlotDef {
  const r = row === 'top' ? TOP : MID;
  return {
    id,
    row,
    shop,
    footprint: { x, y: r.y0, w, h: r.y1 - r.y0 },
    lane: row === 'top' ? 'upper' : 'lower',
    counterY: r.y1,
    customer: { x0: x + 0.6, x1: x + w - 0.6, y: r.y1 + CUSTOMER_GAP },
    merchantCounterY: r.merchantCounterY,
    merchantShelfY: r.merchantShelfY,
    exit: { x: x + 0.5, y: r.y1 + CUSTOMER_GAP },
  };
}

const rectPoly = (r: Rect): Polygon => [
  { x: r.x, y: r.y },
  { x: r.x + r.w, y: r.y },
  { x: r.x + r.w, y: r.y + r.h },
  { x: r.x, y: r.y + r.h },
];

// Reference x (top row: 26, 138, 250, 390, 502 at scale 1.0577; middle: 40, 144, 268, 392, 496).
const stalls = [
  stall(0, 'pawnbroker', 'top', 1.625, 6.875),
  stall(1, 'bakery', 'top', 8.625, 6.875),
  stall(2, 'pottery', 'top', 15.625, 6.875), // the center stall; the gate is to its right
  stall(3, 'clothing', 'top', 24.375, 6.875),
  stall(4, 'wine', 'top', 31.375, 6.875),
  stall(5, 'smithy', 'middle', 2.5, 6.5),
  stall(6, 'perfume', 'middle', 9, 6.5),
  stall(7, 'spices', 'middle', 16.75, 6.5),
  stall(8, 'rugs', 'middle', 24.5, 6.5),
  stall(9, 'jewelry', 'middle', 31, 6.5),
] as const satisfies readonly StallSlotDef[];

const upper: Rect = { x: 0, y: TOP.y1, w: W, h: MID.y0 - TOP.y1 };
const lower: Rect = { x: 0, y: MID.y1, w: W, h: H - MID.y1 };
const alleyA: Rect = { x: 15.5, y: MID.y0, w: 1.25, h: MID.y1 - MID.y0 };
const alleyB: Rect = { x: 23.25, y: MID.y0, w: 1.25, h: MID.y1 - MID.y0 };
const passageL: Rect = { x: 0, y: MID.y0, w: 2.5, h: MID.y1 - MID.y0 };
const passageR: Rect = { x: 37.5, y: MID.y0, w: 2.5, h: MID.y1 - MID.y0 };
const gate: Rect = { x: 22.625, y: 0, w: 1.75, h: TOP.y1 };
const stocks: Rect = { x: 1.4, y: 33, w: 3.7, h: 3.3 };

export const LAYOUT = {
  id: 'forum-v1',
  size: { w: W, h: H },
  tilePx: 48,
  groundFactor: 0.6,
  lanes: {
    upper: { id: 'upper', rect: upper, y: 15.5 },
    lower: { id: 'lower', rect: lower, y: 31.5 },
  },
  stalls,
  // One person wide, between middle-row stalls 2–3 and 3–4 (SPEC §6.3).
  alleys: [
    { id: 'alley-a', rect: alleyA, between: [6, 7] },
    { id: 'alley-b', rect: alleyB, between: [7, 8] },
  ],
  passages: [
    { id: 'left', rect: passageL },
    { id: 'right', rect: passageR },
  ],
  // The left and right ends of both lanes (SPEC §6.10); the lower-left one sits above the stocks.
  entries: [
    {
      id: 'upperLeft',
      lane: 'upper',
      at: { x: 0.5, y: 15 },
      spawn: { x: -1.5, y: 15 },
      label: 'top left',
    },
    {
      id: 'upperRight',
      lane: 'upper',
      at: { x: 39.5, y: 15 },
      spawn: { x: 41.5, y: 15 },
      label: 'top right',
    },
    {
      id: 'lowerLeft',
      lane: 'lower',
      at: { x: 0.5, y: 29 },
      spawn: { x: -1.5, y: 29 },
      label: 'bottom left',
    },
    {
      id: 'lowerRight',
      lane: 'lower',
      at: { x: 39.5, y: 31.5 },
      spawn: { x: 41.5, y: 31.5 },
      label: 'bottom right',
    },
  ],
  // The gated aisle beside the center top-row stall (reference x 362–390).
  gate: { rect: gate, beside: 2, spawn: { x: 23.5, y: -1.5 }, at: { x: 23.5, y: 11.5 } },
  // Lower-left corner (reference 22, 290, 60 × 62); several standing slots (SPEC §11 #27).
  stocks: {
    rect: stocks,
    slots: [
      { x: 2.1, y: 35.4 },
      { x: 3.25, y: 35.4 },
      { x: 4.4, y: 35.4 },
    ],
  },
  walkable: [upper, lower, alleyA, alleyB, passageL, passageR].map(rectPoly),
  blockers: [...stalls.map((s) => s.footprint), gate, stocks],
  // Upper lane → alley A → lower lane → right passage → upper lane → alley B → lower lane → left passage.
  patrol: [
    { x: 1.25, y: 15.5 },
    { x: 16.125, y: 15.5 },
    { x: 16.125, y: 31.5 },
    { x: 38.75, y: 31.5 },
    { x: 38.75, y: 15.5 },
    { x: 23.875, y: 15.5 },
    { x: 23.875, y: 31.5 },
    { x: 1.25, y: 31.5 },
  ],
} as const satisfies LayoutDef;
