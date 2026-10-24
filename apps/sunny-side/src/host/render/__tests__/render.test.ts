import { describe, expect, it } from 'vitest';
import type { RoundBreakdown } from '../../../shared/messages';
import { theme } from '../../../shared/theme';
import { arenaGeometry, drawArena, handleSegment } from '../arena';
import { breakdownRowModels, itemLabel, outLabel, pointsLabel } from '../breakdown';
import { JIGGLE_MS, JiggleTracker, SQUASH_MAX, eggSquash, yolkGlow } from '../egg';
import { EMOJI_CAP, EMOJI_LIFE_MS, EmojiLayer } from '../emojiLayer';
import { PULSE_RADIUS, readyFill, windupRadius } from '../ghost';
import {
  BD_POINTS_SIZE,
  BD_TEXT_LINES,
  BD_TEXT_SIZE,
  SAFE_RECT,
  breakdownLayout,
  hudLayout,
  insideSafe,
  lobbyLayout,
  overlaps,
  screenLayout,
  type Rect,
} from '../layout';
import { ARM_MS, RemoveArm, pressRemove } from '../remove';
import { MaxFlashTracker, slamRingFill } from '../slamRing';

describe('emoji layer', () => {
  it('caps at 12 and drops the oldest', () => {
    const layer = new EmojiLayer();
    for (let i = 0; i < EMOJI_CAP + 5; i++) layer.spawn(`e${i}`, 0);
    expect(layer.count()).toBe(EMOJI_CAP);
    const glyphs = layer.frames(0).map((f) => f.glyph);
    expect(glyphs[0]).toBe('e5');
    expect(glyphs).not.toContain('e0');
  });

  it('rises and fades over a fixed lifetime', () => {
    const layer = new EmojiLayer();
    layer.spawn('x', 1000);
    const at = (dt: number) => layer.frames(1000 + dt)[0];
    const a = at(0)!;
    const b = at(EMOJI_LIFE_MS / 2)!;
    const c = at(EMOJI_LIFE_MS * 0.95)!;
    expect(b.y).toBeLessThan(a.y);
    expect(c.y).toBeLessThan(b.y);
    expect(a.alpha).toBe(1);
    expect(c.alpha).toBeLessThan(0.5);
    expect(layer.frames(1000 + EMOJI_LIFE_MS)).toHaveLength(0);
  });
});

describe('slam ring and flash', () => {
  it('fill equals charge', () => {
    for (const c of [0, 0.25, 0.6, 1]) expect(slamRingFill(c)).toBe(c);
    expect(slamRingFill(2)).toBe(1);
  });

  it('flashes once per charge', () => {
    const t = new MaxFlashTracker();
    expect(t.update('a', false, 0.5, 0)).toBe(false);
    expect(t.update('a', true, 1, 10)).toBe(true);
    expect(t.update('a', true, 1, 20)).toBe(false);
    expect(t.update('a', true, 1, 30)).toBe(false);
    expect(t.flash('a', 10)).toBe(1);
    expect(t.flash('a', 10_000)).toBe(0);
    // Released, then a new full charge flashes again.
    t.update('a', false, 0, 40);
    expect(t.update('a', true, 1, 50)).toBe(true);
  });
});

describe('egg', () => {
  it('squash and yolk glow are monotonic in charge', () => {
    let prevS = -1;
    let prevG = -1;
    for (let i = 0; i <= 20; i++) {
      const c = i / 20;
      expect(eggSquash(c)).toBeGreaterThanOrEqual(prevS);
      expect(yolkGlow(c)).toBeGreaterThanOrEqual(prevG);
      prevS = eggSquash(c);
      prevG = yolkGlow(c);
    }
    expect(eggSquash(0)).toBe(0);
    expect(eggSquash(1)).toBe(SQUASH_MAX);
    expect(yolkGlow(1)).toBeGreaterThan(yolkGlow(0));
  });

  it('jiggles on a hit and settles', () => {
    const j = new JiggleTracker();
    expect(j.amount('a', 0)).toBe(0);
    j.hit('a', 500, 100);
    const samples = [110, 130, 160, 200].map((t) => Math.abs(j.amount('a', t)));
    expect(Math.max(...samples)).toBeGreaterThan(0.05);
    expect(j.active('a', 100 + JIGGLE_MS - 1)).toBe(true);
    expect(j.amount('a', 100 + JIGGLE_MS)).toBe(0);
    expect(j.active('a', 100 + JIGGLE_MS)).toBe(false);
  });
});

describe('ghost telegraph', () => {
  it('wind-up ring grows to the real pulse radius; ready fill shows cooldown', () => {
    expect(windupRadius(0)).toBe(0);
    expect(windupRadius(1)).toBe(PULSE_RADIUS);
    expect(windupRadius(0.5)).toBeLessThan(windupRadius(0.8));
    expect(readyFill(0)).toBe(1);
    expect(readyFill(1)).toBe(0);
  });
});

function hudRects(n: number): Rect[] {
  const l = hudLayout(n);
  return [
    l.roundLabel,
    l.scoreboard.panel,
    ...l.scoreboard.rows.flatMap((r) => [r.row, r.pill, r.score]),
    l.shrinkWarning,
    l.emojiLanes.left,
    l.emojiLanes.right,
  ];
}

describe('layout', () => {
  it('safe rect is [96,1824] x [96,984]', () => {
    expect(SAFE_RECT).toEqual({ x: 96, y: 96, w: 1728, h: 888 });
  });

  it.each([2, 8])('HUD rects for %i players lie inside the TV-safe rect', (n) => {
    for (const r of hudRects(n)) expect(insideSafe(r), JSON.stringify(r)).toBe(true);
  });

  it('8 scoreboard rows do not overlap', () => {
    const rows = hudLayout(8).scoreboard.rows.map((r) => r.row);
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) expect(overlaps(rows[i]!, rows[j]!)).toBe(false);
  });

  it.each([2, 8])('lobby rects for %i players lie inside the TV-safe rect', (n) => {
    const l = lobbyLayout(n);
    for (const r of [l.title, l.qrPanel, l.codePanel, l.playersPanel, ...l.rows, l.startButton])
      expect(insideSafe(r), JSON.stringify(r)).toBe(true);
    expect(overlaps(l.startButton, l.playersPanel)).toBe(false);
  });

  it.each([2, 8])('breakdown layout for %i players is safe with no overlapping rows', (n) => {
    const { header, content } = screenLayout();
    expect(insideSafe(header) && insideSafe(content)).toBe(true);
    expect(overlaps(header, content)).toBe(false);
    for (const compact of [false, true]) {
      const l = breakdownLayout(n, content, compact);
      expect(insideSafe(l.panel)).toBe(true);
      for (const row of l.rows) {
        for (const r of [row.row, row.pill, row.points, row.items, row.out, row.total])
          expect(insideSafe(r), JSON.stringify(r)).toBe(true);
        const cells = compact
          ? [row.pill, row.total]
          : [row.pill, row.points, row.items, row.out, row.total];
        for (let i = 0; i < cells.length; i++)
          for (let j = i + 1; j < cells.length; j++)
            expect(overlaps(cells[i]!, cells[j]!)).toBe(false);
      }
      for (let i = 0; i < l.rows.length; i++)
        for (let j = i + 1; j < l.rows.length; j++)
          expect(overlaps(l.rows[i]!.row, l.rows[j]!.row)).toBe(false);
    }
  });
});

describe('breakdown labels', () => {
  const b: RoundBreakdown = {
    round: 3,
    players: [
      {
        playerId: 'a',
        name: 'Abcdefghij',
        color: 'crimson',
        points: 9,
        total: 14,
        left: false,
        items: [
          { kind: 'ko', victimId: 'b', victimName: 'Kai', points: 2 },
          { kind: 'ko', victimId: 'c', victimName: 'Sam', points: 4 },
          { kind: 'survivor', points: 3 },
        ],
        out: null,
      },
      {
        playerId: 'b',
        name: 'Kai',
        color: 'cobalt',
        points: 0,
        total: 3,
        left: true,
        items: [],
        out: { by: 'a', byName: 'Abcdefghij' },
      },
      {
        playerId: 'c',
        name: 'Sam',
        color: 'jade',
        points: 0,
        total: 1,
        left: false,
        items: [],
        out: { by: null, byName: null },
      },
    ],
  };

  it('uses the item points, not hardcoded values', () => {
    expect(itemLabel(b.players[0]!.items[0]!)).toBe('KO Kai +2');
    expect(itemLabel(b.players[0]!.items[1]!)).toBe('KO Sam +4');
    expect(itemLabel(b.players[0]!.items[2]!)).toBe('Survivor +3');
    expect(pointsLabel(9)).toBe('+9');
  });

  it('describes how each player went out', () => {
    expect(outLabel(b.players[0]!)).toBe('survived');
    expect(outLabel(b.players[1]!)).toBe('knocked out by Abcdefghij');
    expect(outLabel(b.players[2]!)).toBe('fell off');
    const rows = breakdownRowModels(b);
    expect(rows.map((r) => r.total)).toEqual(['14', '3', '1']);
    expect(rows[1]!.left).toBe(true);
  });
});

describe('pan heat geometry', () => {
  const arena = (radius: number, shrinking: boolean) => ({ radius, startRadius: 500, shrinking });
  it('keeps the pan at its start radius while the heat ring grows inward', () => {
    for (const r of [500, 400, 300, 200]) {
      const g = arenaGeometry(arena(r, r < 500) as never);
      expect(g.panRadius).toBe(500);
      expect(g.safeRadius).toBe(r);
      if (r < 500) expect(g.heat).toEqual({ inner: r, outer: 500 });
      else expect(g.heat).toBeNull();
    }
  });
  it('handle starts at the original pan edge', () => {
    const h = handleSegment(500);
    expect(Math.hypot(h.x0, h.y0)).toBeCloseTo(507);
  });
});

describe('pan heat ring after the shrink ends', () => {
  const calls = (radius: number, shrinking: boolean) => {
    const out: { width: number; alpha: number; r: number; color: number }[] = [];
    let cur = { width: 0, alpha: 0, color: 0 };
    const g = {
      fillStyle: () => g,
      fillRect: () => g,
      fillCircle: () => g,
      lineBetween: () => g,
      lineStyle: (width: number, color: number, alpha: number) => {
        cur = { width, alpha, color };
        return g;
      },
      strokeCircle: (_x: number, _y: number, r: number) => {
        out.push({ ...cur, r });
        return g;
      },
    };
    drawArena(g as never, 0, 0, { radius, startRadius: 500, shrinking } as never, 1234);
    return out;
  };
  it('draws the ring (inner = current radius) when not shrinking at the minimum', () => {
    const c = calls(200, false);
    const ring = c.find((x) => x.color === theme.color.heat.num && x.width === 300);
    expect(ring).toBeDefined();
    expect(ring!.alpha).toBeGreaterThan(0);
    expect(ring!.r - ring!.width / 2).toBeCloseTo(200);
    expect(c.some((x) => x.r === 200)).toBe(true);
  });
  it('draws no heat at the start radius', () => {
    expect(calls(500, false).some((x) => x.color === theme.color.heat.num)).toBe(false);
  });
});

describe('breakdown text size on the TV', () => {
  it('is enlarged and 8 players fit two lines per row inside the safe rect', () => {
    expect(BD_TEXT_SIZE).toBeGreaterThanOrEqual(28);
    const l = breakdownLayout(8, screenLayout().content);
    expect(insideSafe(l.panel)).toBe(true);
    for (const r of l.rows) {
      expect(r.row.h).toBeGreaterThanOrEqual(BD_TEXT_SIZE * BD_TEXT_LINES + 8);
      expect(r.row.h).toBeGreaterThanOrEqual(BD_POINTS_SIZE + 8);
      expect(r.items.w).toBeGreaterThan(600);
    }
  });
});

describe('ghost knockout label', () => {
  const entry = (out: RoundBreakdown['players'][number]['out']) => ({
    playerId: 'a',
    name: 'Ann',
    color: 'crimson' as const,
    points: 0,
    total: 0,
    left: false,
    items: [],
    out,
  });
  it('says "knocked out by ghost" (no name) for an uncredited ghost KO, else "fell off"', () => {
    expect(outLabel(entry({ by: null, byName: null, ghost: true }))).toBe('knocked out by ghost');
    expect(outLabel(entry({ by: null, byName: null, ghost: false }))).toBe('fell off');
    expect(outLabel(entry({ by: null, byName: null }))).toBe('fell off');
    expect(outLabel(entry({ by: 'b', byName: 'Bo', ghost: true }))).toBe('knocked out by Bo');
  });
});

describe('remove arm', () => {
  it('first click arms, a second click inside the window confirms', () => {
    const a = new RemoveArm();
    expect(a.press('p1', 1000)).toBe(false);
    expect(a.isArmed('p1', 1000 + ARM_MS - 1)).toBe(true);
    expect(a.press('p1', 1000 + ARM_MS - 1)).toBe(true);
    expect(a.isArmed('p1', 1000 + ARM_MS - 1)).toBe(false);
  });
  it('disarms after the window or when another row is pressed', () => {
    const a = new RemoveArm();
    a.press('p1', 0);
    expect(a.isArmed('p1', ARM_MS)).toBe(false);
    expect(a.press('p1', ARM_MS)).toBe(false);
    a.press('p2', ARM_MS + 1);
    expect(a.isArmed('p1', ARM_MS + 2)).toBe(false);
  });
});

describe('pressRemove', () => {
  it('arms on the first press, removes on the second, ignores presses elsewhere', () => {
    const removed: string[] = [];
    let redraws = 0;
    let now = 0;
    const ctl = {
      arm: new RemoveArm(),
      remove: (id: string) => void removed.push(id),
      changed: () => void redraws++,
      now: () => now,
    };
    const buttons = [{ playerId: 'p1', hit: { x: 100, y: 100, w: 48, h: 48 } }];
    expect(pressRemove(ctl, buttons, 10, 10)).toBe(false);
    expect(pressRemove(ctl, buttons, 120, 120)).toBe(true);
    expect(removed).toEqual([]);
    now = 500;
    expect(pressRemove(ctl, buttons, 120, 120)).toBe(true);
    expect(removed).toEqual(['p1']);
    expect(redraws).toBe(2);
  });
});

describe('remove controls layout', () => {
  const inside = (r: Rect, o: Rect) =>
    r.x >= o.x && r.y >= o.y && r.x + r.w <= o.x + o.w && r.y + r.h <= o.y + o.h;

  it.each([2, 8])('lobby remove rects for %i players are safe and do not overlap', (n) => {
    const l = lobbyLayout(n);
    for (let i = 0; i < n; i++) {
      const r = l.removes[i]!;
      expect(insideSafe(r.idle) && insideSafe(r.armed)).toBe(true);
      expect(inside(r.armed, l.rows[i]!)).toBe(true);
      for (let j = i + 1; j < n; j++) {
        expect(overlaps(r.idle, l.removes[j]!.idle)).toBe(false);
        expect(overlaps(r.armed, l.removes[j]!.armed)).toBe(false);
      }
    }
  });

  it.each([2, 8])('breakdown remove rects for %i players are safe and clear of the cells', (n) => {
    for (const compact of [false, true]) {
      const l = breakdownLayout(n, screenLayout().content, compact);
      l.rows.forEach((row, i) => {
        expect(insideSafe(row.remove.idle) && insideSafe(row.remove.armed)).toBe(true);
        expect(inside(row.remove.armed, row.row)).toBe(true);
        const cells = compact
          ? [row.pill, row.total]
          : [row.pill, row.points, row.items, row.out, row.total];
        for (const c of cells) expect(overlaps(row.remove.idle, c)).toBe(false);
        for (let j = i + 1; j < l.rows.length; j++)
          expect(overlaps(row.remove.armed, l.rows[j]!.remove.armed)).toBe(false);
      });
    }
  });
});
