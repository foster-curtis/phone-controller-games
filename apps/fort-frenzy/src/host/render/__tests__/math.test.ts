// Camera projection, ground ellipses and carried-cell pips (SPEC §2.5, §15.2).
import { describe, expect, it } from 'vitest';
import { FixedCamera, UNIT_PX } from '../camera';
import { carryPip, carryPips, ellipsePoint, PIP_PAD_Y } from '../ground';

describe('FixedCamera', () => {
  const cam = new FixedCamera();

  it('projects sx = 96 + x·W, sy = 216 + y·W·0.6 − z·W', () => {
    expect(cam.worldToScreen(0, 0)).toEqual({ sx: 96, sy: 216 });
    const p = cam.worldToScreen(10, 5, 1.5);
    expect(p.sx).toBe(576);
    expect(p.sy).toBeCloseTo(216 + 144 - 72);
    expect(cam.scale).toBe(1);
  });

  it('fits the 36 × 24 playfield in x 96–1824, y 216–907 (§15.2 screen layout)', () => {
    const br = cam.worldToScreen(36, 24);
    expect(br.sx).toBe(1824);
    expect(br.sy).toBeCloseTo(907.2, 5);
  });

  it('keeps a flyer’s shadow straight below it: same sx, ground sy', () => {
    const body = cam.worldToScreen(7, 9, 1.6);
    const shadow = cam.worldToScreen(7, 9);
    expect(body.sx).toBe(shadow.sx);
    expect(shadow.sy - body.sy).toBeCloseTo(1.6 * 48);
  });

  it('draws a world circle as a 0.6 ellipse (rx = r·W·k, ry = 0.6 rx)', () => {
    expect(cam.groundEllipse(1)).toEqual({ rx: 48, ry: 28.799999999999997 });
    const { rx, ry } = cam.groundEllipse(2.5);
    expect(rx).toBe(120);
    expect(ry / rx).toBeCloseTo(0.6);
  });

  it('maps 80 sprite units to one 48 px tile', () => {
    expect(80 * UNIT_PX).toBe(48);
  });

  it('places ellipse points for an aim angle on the projected circle', () => {
    expect(ellipsePoint(0, 0, 10, 6, 0)).toEqual({ x: 10, y: 0 });
    const down = ellipsePoint(0, 0, 10, 6, Math.PI / 2);
    expect(down.x).toBeCloseTo(0);
    expect(down.y).toBeCloseTo(6);
  });
});

describe('carry pips (§15.2: a = 90° + (cap − 1)·7.5° − k·15°)', () => {
  const rx = 54.4;
  const ry = 32.64;

  it('centers a single slot straight in front of the ring', () => {
    const p = carryPip(0, 1, 0, 0, rx, ry);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(ry + PIP_PAD_Y);
  });

  it('spreads cap 4 at 112.5°, 97.5°, 82.5°, 67.5°, left to right, symmetric', () => {
    const pts = [0, 1, 2, 3].map((k) => carryPip(k, 4, 100, 200, rx, ry));
    const deg = [112.5, 97.5, 82.5, 67.5].map((d) => (d * Math.PI) / 180);
    pts.forEach((p, k) => {
      expect(p.x).toBeCloseTo(100 + (rx + 8) * Math.cos(deg[k]!));
      expect(p.y).toBeCloseTo(200 + (ry + 4.8) * Math.sin(deg[k]!));
    });
    expect(pts[0]!.x).toBeLessThan(pts[3]!.x);
    expect(pts[0]!.x - 100).toBeCloseTo(-(pts[3]!.x - 100));
    expect(pts[0]!.y).toBeCloseTo(pts[3]!.y);
  });

  it('cap 8 (the Artificer) spans 142.5°…37.5°, all on the front arc', () => {
    const first = carryPip(0, 8, 0, 0, rx, ry);
    const last = carryPip(7, 8, 0, 0, rx, ry);
    expect(first.x).toBeCloseTo((rx + 8) * Math.cos((142.5 * Math.PI) / 180));
    expect(last.x).toBeCloseTo((rx + 8) * Math.cos((37.5 * Math.PI) / 180));
    for (let k = 0; k < 8; k++) expect(carryPip(k, 8, 0, 0, rx, ry).y).toBeGreaterThan(0);
  });

  it('shows pips only while carrying, filled left to right', () => {
    expect(carryPips(0, 4, 0, 0, rx, ry)).toEqual([]);
    expect(carryPips(3, 4, 0, 0, rx, ry).map((p) => p.filled)).toEqual([true, true, true, false]);
    expect(carryPips(5, 8, 0, 0, rx, ry)).toHaveLength(8);
  });
});
