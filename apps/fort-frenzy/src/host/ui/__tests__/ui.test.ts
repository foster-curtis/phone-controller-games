import { describe, expect, it } from 'vitest';
import { createPadNav, keyToNav, stepHome, type NavKey, type PadLike } from '../homeNav';
import { BANDS, CITADEL_CENTER_X, SAFE_BOX, fitScale, insideSafe, laneBand } from '../layout';
import { ARM_MS, createRemoveArm } from '../removeArm';
import type { HomeRow } from '../types';

describe('band geometry (SPEC §15.2 table)', () => {
  it('matches the table', () => {
    expect([BANDS.topMargin.y, BANDS.topMargin.y + BANDS.topMargin.h]).toEqual([0, 96]);
    expect([BANDS.topHud.y, BANDS.topHud.y + BANDS.topHud.h]).toEqual([96, 136]);
    expect([BANDS.headroom.y, BANDS.headroom.y + BANDS.headroom.h]).toEqual([136, 216]);
    expect([BANDS.playfield.y, BANDS.playfield.y + BANDS.playfield.h]).toEqual([216, 907]);
    expect([BANDS.bottomHud.y, BANDS.bottomHud.y + BANDS.bottomHud.h]).toEqual([907, 984]);
    expect([BANDS.bottomMargin.y, BANDS.bottomMargin.y + BANDS.bottomMargin.h]).toEqual([
      984, 1080,
    ]);
  });
  it('keeps every band inside the 96 px safe margin, playfield x 96–1824', () => {
    for (const b of [BANDS.topHud, BANDS.headroom, BANDS.playfield, BANDS.bottomHud]) {
      expect(insideSafe(b)).toBe(true);
    }
    expect([BANDS.playfield.x, BANDS.playfield.x + BANDS.playfield.w]).toEqual([96, 1824]);
    expect(SAFE_BOX).toEqual({ x: 96, y: 96, w: 1728, h: 888 });
  });
  it('centers the base bar over the Citadel and puts lane bands on their edges', () => {
    expect(CITADEL_CENTER_X).toBe(960);
    expect(laneBand('bottom').y + laneBand('bottom').h).toBe(1080);
    expect(laneBand('left').x).toBe(0);
    expect(laneBand('right').x + laneBand('right').w).toBe(1920);
  });
  it('fits 1920 × 1080 into any window', () => {
    expect(fitScale(1280, 720)).toEqual({ scale: 2 / 3, x: 0, y: 0 });
    const f = fitScale(1000, 1000);
    expect(f.scale).toBeCloseTo(1000 / 1920);
    expect(f.x).toBeCloseTo(0);
    expect(f.y).toBeGreaterThan(0);
  });
});

const rows: HomeRow[] = [
  { id: 'create' },
  { id: 'theme', theme: 'neon-knights' },
  { id: 'difficulty', difficulty: 'normal' },
  { id: 'resume', wave: 7, savedAgoMs: 1000 },
  { id: 'newRun' },
];

describe('home navigation', () => {
  it('maps keys, ignoring the rest', () => {
    expect(keyToNav('ArrowDown')).toBe('down');
    expect(keyToNav('Enter')).toBe('select');
    expect(keyToNav('Tab')).toBeNull();
  });
  it('moves focus with up/down and wraps', () => {
    expect(stepHome(rows, 0, 'down')).toEqual({ type: 'focus', index: 1 });
    expect(stepHome(rows, 0, 'up')).toEqual({ type: 'focus', index: 4 });
    expect(stepHome(rows, 4, 'down')).toEqual({ type: 'focus', index: 0 });
  });
  it('◂ ▸ cycle theme and difficulty only', () => {
    expect(stepHome(rows, 1, 'right')).toEqual({ type: 'cycle', row: 'theme', dir: 1 });
    expect(stepHome(rows, 2, 'left')).toEqual({ type: 'cycle', row: 'difficulty', dir: -1 });
    expect(stepHome(rows, 0, 'left')).toBeNull();
    expect(stepHome(rows, 3, 'right')).toBeNull();
  });
  it('select activates rows (and nudges the ◂ ▸ rows forward)', () => {
    expect(stepHome(rows, 0, 'select')).toEqual({ type: 'activate', row: 'create' });
    expect(stepHome(rows, 3, 'select')).toEqual({ type: 'activate', row: 'resume' });
    expect(stepHome(rows, 2, 'select')).toEqual({ type: 'cycle', row: 'difficulty', dir: 1 });
  });
  it('does nothing without rows', () => {
    expect(stepHome([], 0, 'down')).toBeNull();
  });

  it('a fake gamepad drives it: d-pad, stick and A, once per press', () => {
    const pad = (pressed: number[] = [], axes: number[] = [0, 0]): PadLike => ({
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
      axes,
    });
    const next = createPadNav();
    const log: NavKey[] = [];
    let focus = 0;
    const press = (p: PadLike | null) => {
      for (const k of next([p])) {
        log.push(k);
        const i = stepHome(rows, focus, k);
        if (i?.type === 'focus') focus = i.index;
      }
    };
    press(pad([13])); // d-pad down
    press(pad([13])); // still held: no repeat
    expect(focus).toBe(1);
    press(pad()); // released
    press(pad([], [0, 0.9])); // stick down
    expect(focus).toBe(2);
    press(pad());
    press(pad([14])); // d-pad left
    press(pad([0])); // A
    press(null); // pad unplugged
    expect(log).toEqual(['down', 'down', 'left', 'select']);
  });
});

describe('TV remove arm/confirm', () => {
  it('arms on the first press and confirms on the second', () => {
    const a = createRemoveArm();
    expect(a.press(2, 0)).toBe('armed');
    expect(a.armed(10)).toBe(2);
    expect(a.press(2, 100)).toBe('confirmed');
    expect(a.armed(110)).toBeNull();
  });
  it('another slot re-arms, and the arm times out', () => {
    const a = createRemoveArm();
    a.press(1, 0);
    expect(a.press(2, 10)).toBe('armed');
    expect(a.armed(ARM_MS + 11)).toBeNull();
    expect(a.press(2, ARM_MS + 20)).toBe('armed');
  });
});
