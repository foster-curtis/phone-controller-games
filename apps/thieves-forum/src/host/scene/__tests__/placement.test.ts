// Map placement from layout config (SPEC §6.3, §12.2, §12.4): stalls fill their footprints with the
// counter's front edge on the footprint's front edge; the floor covers the market.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../../content';
import { floorTiles, frontAnchor, stallBox } from '../placement';

describe('placement', () => {
  it('scales each stall box to its footprint and sorts it at the counter line', () => {
    for (const slot of CONTENT.layout.stalls) {
      const b = stallBox(slot);
      expect(b.x).toBeCloseTo(slot.footprint.x * 48);
      expect(b.unitPx * 104).toBeCloseTo(slot.footprint.w * 48);
      expect(b.sortY).toBeCloseTo(slot.counterY * 28.8);
      expect(b.y + 87 * b.unitPx).toBeCloseTo(b.sortY);
      expect(b.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('stands the gate and the stocks on their front edges', () => {
    const g = frontAnchor(CONTENT.layout.gate.rect);
    expect(g.y).toBeCloseTo(10.1 * 28.8);
    const s = frontAnchor(CONTENT.layout.stocks.rect);
    expect(s.y).toBeLessThanOrEqual(1080);
  });

  it('tiles the whole 1920 × 1080 canvas', () => {
    const t = floorTiles(CONTENT.layout);
    expect(t.length).toBe(40 * 38);
    expect(Math.max(...t.map((p) => p.x)) + 48).toBeGreaterThanOrEqual(1920);
    expect(Math.max(...t.map((p) => p.y)) + 28.8).toBeGreaterThanOrEqual(1080);
  });
});
