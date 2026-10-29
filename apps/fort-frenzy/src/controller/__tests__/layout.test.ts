import { describe, expect, it } from 'vitest';
import { ACTION_D, MAIN_D, MIN_EDGE, MIN_GAP, SUPER_D, gapBetween, layoutCombat } from '../layout';

const VIEWPORTS: [number, number][] = [
  [644, 300],
  [844, 390],
  [932, 430],
  [1180, 820],
  [1366, 1024],
];
// An iPhone-like landscape inset set, and none.
const INSETS = [
  { top: 0, right: 0, bottom: 0, left: 0 },
  { top: 0, right: 47, bottom: 21, left: 47 },
];

describe('layoutCombat (SPEC §10.1)', () => {
  for (const [width, height] of VIEWPORTS) {
    for (const insets of INSETS) {
      const label = `${width}x${height} insets ${insets.right}/${insets.bottom}`;
      const l = layoutCombat({ width, height }, insets);
      const buttons = [l.main, l.super, l.action];

      it(`${label}: gaps between buttons are at least ${MIN_GAP} px`, () => {
        expect(gapBetween(l.main, l.super)).toBeGreaterThanOrEqual(MIN_GAP);
        expect(gapBetween(l.main, l.action)).toBeGreaterThanOrEqual(MIN_GAP);
        expect(gapBetween(l.super, l.action)).toBeGreaterThanOrEqual(MIN_GAP);
      });

      it(`${label}: no button edge is within ${MIN_EDGE} px of the right or bottom (inside the safe area)`, () => {
        for (const b of buttons) {
          expect(width - insets.right - (b.cx + b.d / 2)).toBeGreaterThanOrEqual(MIN_EDGE);
          expect(height - insets.bottom - (b.cy + b.d / 2)).toBeGreaterThanOrEqual(MIN_EDGE);
        }
      });

      it(`${label}: every button is at least 56 px and the sizes are the spec's`, () => {
        for (const b of buttons) expect(b.d).toBeGreaterThanOrEqual(56);
        expect([l.main.d, l.super.d, l.action.d]).toEqual([MAIN_D, SUPER_D, ACTION_D]);
      });

      it(`${label}: everything stays on screen and the stick is on the left half`, () => {
        for (const b of [...buttons, l.stick]) {
          expect(b.cx - b.d / 2).toBeGreaterThanOrEqual(insets.left);
          expect(b.cy - b.d / 2).toBeGreaterThanOrEqual(insets.top);
        }
        expect(l.stick.cx).toBeLessThan(width / 2);
        expect(l.stick.cx - l.stick.d / 2).toBeGreaterThanOrEqual(insets.left);
        expect(l.stick.cy + l.stick.d / 2).toBeLessThanOrEqual(height - insets.bottom);
      });
    }
  }

  it('matches the 844x390 reference positions', () => {
    const l = layoutCombat({ width: 844, height: 390 });
    expect(l.main.cx).toBeCloseTo(844 - 168.8, 1);
    expect(l.main.cy).toBeCloseTo(390 - 124.8, 1);
    expect(l.stick.cx).toBeCloseTo(143.48, 1);
    expect(l.stick.cy).toBeCloseTo(390 - 117, 1);
    expect(l.super.cx - l.main.cx).toBe(-92);
    expect(l.super.cy - l.main.cy).toBe(-78);
    expect(l.action.cx - l.main.cx).toBe(-118);
    expect(l.action.cy - l.main.cy).toBe(20);
  });

  it('applies safe-area insets (offsets are added to them)', () => {
    const plain = layoutCombat({ width: 844, height: 390 });
    const inset = layoutCombat(
      { width: 844, height: 390 },
      { top: 0, right: 47, bottom: 21, left: 47 },
    );
    expect(inset.main.cx).toBeLessThan(plain.main.cx);
    expect(inset.stick.cx).toBeGreaterThan(plain.stick.cx);
    expect(inset.main.cy).toBeGreaterThan(0);
  });
});
