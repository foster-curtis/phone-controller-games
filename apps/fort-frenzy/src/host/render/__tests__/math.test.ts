// Camera projection, ground ellipses (SPEC §2.5, §15.2).
import { describe, expect, it } from 'vitest';
import { FixedCamera, MAP_SIDE_MARGIN, UNIT_PX, UNIT_FIT, fitMap } from '../camera';
import { ellipsePoint } from '../ground';

describe('FixedCamera', () => {
  const cam = new FixedCamera(UNIT_FIT);

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

describe('fitMap (RD5-fix-4)', () => {
  for (const [w, h] of [
    [1920, 1080],
    [1280, 720],
    [3840, 2160],
  ] as const) {
    it(`fits the map just inside the view width at ${w}×${h}, whole map in view`, () => {
      const f = fitMap(w, h);
      expect(f.limit).toBe('width');
      expect(f.mapW).toBeCloseTo(w * (1 - 2 * MAP_SIDE_MARGIN), 6);
      expect(f.mapW).toBeLessThan(w);
      expect(f.originX).toBeGreaterThan(0);
      expect(f.originX + f.mapW).toBeLessThanOrEqual(w);
      // Below the top HUD line and above the TV-safe bottom (96 px at 1080).
      const s = h / 1080;
      expect(f.originY).toBeGreaterThanOrEqual(136 * s);
      expect(f.originY + f.mapH).toBeLessThanOrEqual(h - 96 * s + 1e-6);
      expect(f.scale).toBeCloseTo((w / 1920) * 1.0889, 3);
    });
  }

  it('the TV camera uses the 1920 fit: k ≈ 1.089, map x 19–1901, y 223–976', () => {
    const cam = new FixedCamera();
    expect(cam.scale).toBeCloseTo(1.0889, 3);
    const tl = cam.worldToScreen(0, 0);
    const br = cam.worldToScreen(36, 24);
    expect(tl.sx).toBeCloseTo(19.2, 1);
    expect(br.sx).toBeCloseTo(1900.8, 1);
    expect(tl.sy).toBeCloseTo(223.1, 0);
    expect(br.sy).toBeCloseTo(975.75, 1);
  });

  it('the Citadel stays centered on x = 960', () => {
    expect(new FixedCamera().worldToScreen(18, 0).sx).toBeCloseTo(960, 6);
  });
});
