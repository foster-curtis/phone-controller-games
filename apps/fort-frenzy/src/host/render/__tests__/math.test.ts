// Camera projection, ground ellipses (SPEC §2.5, §15.2).
import { describe, expect, it } from 'vitest';
import { FixedCamera, UNIT_PX } from '../camera';
import { ellipsePoint } from '../ground';

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
