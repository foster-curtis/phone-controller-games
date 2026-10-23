// Pure layout for the TV (SPEC §6.6): every HUD rect is computed here so tests can prove it stays
// inside the TV-safe rectangle (theme.space.tvSafe from each edge of the 1920×1080 canvas).
import { theme } from '../../shared/theme';

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const SAFE = theme.space.tvSafe;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The TV-safe rect: [96, 1824] × [96, 984]. */
export const SAFE_RECT: Rect = { x: SAFE, y: SAFE, w: WIDTH - SAFE * 2, h: HEIGHT - SAFE * 2 };

export function insideSafe(r: Rect): boolean {
  return (
    r.x >= SAFE_RECT.x &&
    r.y >= SAFE_RECT.y &&
    r.x + r.w <= SAFE_RECT.x + SAFE_RECT.w &&
    r.y + r.h <= SAFE_RECT.y + SAFE_RECT.h
  );
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Moves a rect the minimum distance to lie inside the TV-safe rect (never resizes it). */
export function clampToSafe(r: Rect): Rect {
  return {
    ...r,
    x: Math.min(Math.max(r.x, SAFE_RECT.x), SAFE_RECT.x + SAFE_RECT.w - r.w),
    y: Math.min(Math.max(r.y, SAFE_RECT.y), SAFE_RECT.y + SAFE_RECT.h - r.h),
  };
}

const PAD = theme.space[3];

export interface ScoreRow {
  row: Rect;
  pill: Rect;
  score: Rect;
}

export interface ScoreboardLayout {
  panel: Rect;
  rows: ScoreRow[];
}

const BOARD_W = 340;
const BOARD_ROW_H = 52;

/** In-round scoreboard: top-right panel, one row per player (max 8). */
export function scoreboardLayout(n: number): ScoreboardLayout {
  const h = PAD * 2 + n * BOARD_ROW_H;
  const panel: Rect = { x: SAFE_RECT.x + SAFE_RECT.w - BOARD_W, y: SAFE_RECT.y, w: BOARD_W, h };
  const rows: ScoreRow[] = [];
  for (let i = 0; i < n; i++) {
    const row: Rect = {
      x: panel.x + PAD,
      y: panel.y + PAD + i * BOARD_ROW_H,
      w: BOARD_W - PAD * 2,
      h: BOARD_ROW_H,
    };
    rows.push({
      row,
      pill: { x: row.x, y: row.y + 6, w: row.w - 84, h: BOARD_ROW_H - 12 },
      score: { x: row.x + row.w - 80, y: row.y, w: 80, h: BOARD_ROW_H },
    });
  }
  return { panel, rows };
}

export interface HudLayout {
  roundLabel: Rect;
  scoreboard: ScoreboardLayout;
  shrinkWarning: Rect;
  /** Where spectator emoji rise (left and right of the pan). */
  emojiLanes: { left: Rect; right: Rect };
}

export function hudLayout(n: number): HudLayout {
  const lane = 220;
  return {
    roundLabel: { x: SAFE_RECT.x, y: SAFE_RECT.y, w: 560, h: 64 },
    scoreboard: scoreboardLayout(n),
    shrinkWarning: { x: WIDTH / 2 - 260, y: SAFE_RECT.y + SAFE_RECT.h - 56, w: 520, h: 56 },
    emojiLanes: {
      left: { x: SAFE_RECT.x, y: SAFE_RECT.y, w: lane, h: SAFE_RECT.h },
      right: { x: SAFE_RECT.x + SAFE_RECT.w - lane, y: SAFE_RECT.y, w: lane, h: SAFE_RECT.h },
    },
  };
}

export interface BreakdownRowLayout {
  row: Rect;
  pill: Rect;
  points: Rect;
  items: Rect;
  out: Rect;
  total: Rect;
}

export interface BreakdownLayout {
  panel: Rect;
  rows: BreakdownRowLayout[];
  /** Compact (no breakdown): name + total only, in a narrower panel. */
  compact: boolean;
}

const BD_PAD = theme.space[4];
const BD_GAP = theme.space[2];
const BD_MAX_ROW = 84;

/**
 * Per-player breakdown rows inside `area` (a sub-rect of the safe rect): name pill, "+N" points,
 * itemized reasons, how they went out, new total. Rows shrink to fit up to 8 players.
 */
export function breakdownLayout(n: number, area: Rect, compact = false): BreakdownLayout {
  const rowH = Math.min(
    BD_MAX_ROW,
    Math.floor((area.h - BD_PAD * 2 - (n - 1) * BD_GAP) / Math.max(1, n)),
  );
  const width = compact ? 760 : area.w;
  const panel: Rect = {
    x: area.x,
    y: area.y,
    w: width,
    h: BD_PAD * 2 + n * rowH + Math.max(0, n - 1) * BD_GAP,
  };
  const inner = panel.w - BD_PAD * 2;
  const pillW = 300;
  const pointsW = 120;
  const outW = 330;
  const totalW = compact ? 140 : 150;
  const rows: BreakdownRowLayout[] = [];
  for (let i = 0; i < n; i++) {
    const row: Rect = {
      x: panel.x + BD_PAD,
      y: panel.y + BD_PAD + i * (rowH + BD_GAP),
      w: inner,
      h: rowH,
    };
    const pill: Rect = { x: row.x, y: row.y, w: pillW, h: rowH };
    const total: Rect = { x: row.x + row.w - totalW, y: row.y, w: totalW, h: rowH };
    if (compact) {
      const none: Rect = { x: row.x + pillW, y: row.y, w: 0, h: rowH };
      rows.push({ row, pill, points: none, items: none, out: none, total });
      continue;
    }
    const points: Rect = { x: pill.x + pillW + BD_GAP, y: row.y, w: pointsW, h: rowH };
    const out: Rect = { x: total.x - BD_GAP - outW, y: row.y, w: outW, h: rowH };
    const itemsX = points.x + pointsW + BD_GAP;
    const items: Rect = { x: itemsX, y: row.y, w: out.x - BD_GAP - itemsX, h: rowH };
    rows.push({ row, pill, points, items, out, total });
  }
  return { panel, rows, compact };
}

/** Results / winner screens: header strip (banner left, host buttons right) and the content area. */
export function screenLayout(): { header: Rect; content: Rect } {
  const header: Rect = { x: SAFE_RECT.x, y: SAFE_RECT.y, w: SAFE_RECT.w, h: 84 };
  const top = header.y + header.h + 92;
  return {
    header,
    content: { x: SAFE_RECT.x, y: top, w: SAFE_RECT.w, h: SAFE_RECT.y + SAFE_RECT.h - top },
  };
}

export interface LobbyLayout {
  title: Rect;
  qrPanel: Rect;
  codePanel: Rect;
  playersPanel: Rect;
  rows: Rect[];
  startButton: Rect;
  footer: Rect;
}

/** Lobby: title top-left, QR + room code on the left, joined players on the right, Start bottom-right. */
export function lobbyLayout(n: number): LobbyLayout {
  const title: Rect = { x: SAFE_RECT.x, y: SAFE_RECT.y, w: 1100, h: 180 };
  const qrPanel: Rect = { x: SAFE_RECT.x, y: 290, w: 520, h: 520 };
  const codePanel: Rect = { x: SAFE_RECT.x, y: qrPanel.y + qrPanel.h + 16, w: 520, h: 150 };
  const rowH = 66;
  const playersPanel: Rect = { x: 760, y: 290, w: 1064, h: PAD * 2 + 8 * rowH };
  const rows: Rect[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      x: playersPanel.x + PAD,
      y: playersPanel.y + PAD + i * rowH,
      w: playersPanel.w - PAD * 2,
      h: rowH,
    });
  }
  const startButton: Rect = { x: SAFE_RECT.x + SAFE_RECT.w - 280, y: 900, w: 280, h: 84 };
  const footer: Rect = { x: 760, y: 900, w: 700, h: 84 };
  return { title, qrPanel, codePanel, playersPanel, rows, startButton, footer };
}
