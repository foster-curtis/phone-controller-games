// Navigation and line of sight from the layout (SPEC §6.3, §12.3).
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../../../content';
import { clearPath, findPath, lineOfSight, navGraph } from '..';

const layout = CONTENT.layout;
const g = navGraph(layout, CONTENT.balance.movement.bodyRadius);

describe('line of sight (SPEC §6.3)', () => {
  it('stalls block it; the lanes and alleys do not', () => {
    expect(lineOfSight(layout, { x: 5, y: 15 }, { x: 35, y: 15 })).toBe(true);
    // Upper lane to lower lane through a middle-row stall.
    expect(lineOfSight(layout, { x: 12, y: 15 }, { x: 12, y: 31 })).toBe(false);
    // Straight down alley A.
    const ax = layout.alleys[0]!.rect.x + layout.alleys[0]!.rect.w / 2;
    expect(lineOfSight(layout, { x: ax, y: 15 }, { x: ax, y: 31 })).toBe(true);
  });

  it('the closed gate blocks; an open one does not', () => {
    const r = layout.gate.rect;
    // Down the gated aisle from off the top into the upper lane.
    const a = { x: r.x + r.w / 2, y: r.y - 1 };
    const b = { x: r.x + r.w / 2, y: r.y + r.h + 1 };
    expect(lineOfSight(layout, a, b)).toBe(false);
    expect(lineOfSight(layout, a, b, true)).toBe(true);
  });
});

describe('waypoint graph', () => {
  it('every node is reachable from every other', () => {
    const seen = new Set([0]);
    const stack = [0];
    while (stack.length)
      for (const e of g.edges[stack.pop()!]!)
        if (!seen.has(e.to)) {
          seen.add(e.to);
          stack.push(e.to);
        }
    expect(seen.size).toBe(g.nodes.length);
  });

  it('a cross-lane path goes through an alley or passage, every leg clear', () => {
    const from = { x: 12, y: 15 };
    const to = { x: 12, y: 31 };
    const path = findPath(g, from, to);
    expect(path.length).toBeGreaterThan(1);
    expect(path[path.length - 1]).toEqual(to);
    let p = from;
    for (const q of path) {
      expect(clearPath(g, p, q)).toBe(true);
      p = q;
    }
  });

  it('a clear straight line is one waypoint', () => {
    expect(findPath(g, { x: 3, y: 30 }, { x: 30, y: 33 })).toEqual([{ x: 30, y: 33 }]);
  });
});
