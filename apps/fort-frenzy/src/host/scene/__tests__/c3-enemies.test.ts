// C3 enemy render fixes (FF10-fix-1): the Wasp's ground point lerps on the ground (its jitter came
// from lerping the sim's flyer z = 1 toward the drawn z = 0), and the Stalker's target flash.
import { describe, expect, it } from 'vitest';
import { HUNT_FLASH_MS, huntFlashLevel } from '../enemyFx';
import { lerpGround, lerpPos, SNAP_TILES } from '../interp';
import type { Pos } from '../shot';

/** Screen y of a ground point (§2.5 squash, height lifts it), in tiles. */
const screenY = (p: Pos) => p.y * 0.6 - p.z;

/**
 * A Wasp flying straight up-field (sim z = 1) at 1.56 tiles/s, drawn over uneven frames: the
 * accumulator's phase (alpha) wanders from frame to frame, as it does on a real display.
 */
function frames(draw: (prev: Pos, x: number, y: number, z: number, alpha: number) => Pos) {
  const v = 1.56 / 60;
  const alphas = [0.1, 0.9, 0.3, 0.95, 0.05, 0.6, 0.2, 0.85, 0.5, 0.15];
  const out: number[] = [];
  let y = 18;
  for (const a of alphas) {
    const prev = { x: 18, y, z: 1 };
    y -= v;
    out.push(screenY(draw(prev, 18, y, 1, a)));
  }
  return out;
}

const steps = (ys: number[]) => ys.slice(1).map((y, i) => y - ys[i]!);

describe('Wasp interpolation (C3)', () => {
  it('the old draw (ground z = 0 lerped from the sim z = 1) jumps back and forth', () => {
    const ys = frames((prev, x, y, _z, a) => lerpPos(prev, x, y, 0, a));
    const d = steps(ys);
    expect(d.some((s) => s > 0.3)).toBe(true); // a frame jumping back down-field
    expect(d.some((s) => s < -0.3)).toBe(true);
  });

  it('the ground point only moves forward, a step at most per frame', () => {
    const ys = frames((prev, x, y, _z, a) => lerpGround(prev, x, y, a));
    for (const s of steps(ys)) {
      expect(s).toBeLessThan(0);
      expect(Math.abs(s)).toBeLessThan((2 * 1.56) / 60);
    }
    expect(lerpGround({ x: 1, y: 1, z: 1 }, 1, 2, 0.5)).toEqual({ x: 1, y: 1.5, z: 0 });
  });

  it('heights lerp between like values; long jumps snap', () => {
    expect(lerpPos({ x: 0, y: 0, z: 1 }, 0.1, 0, 1, 0.3).z).toBe(1);
    expect(lerpPos({ x: 0, y: 0, z: 0 }, SNAP_TILES, 0, 0, 0.5)).toEqual({
      x: SNAP_TILES,
      y: 0,
      z: 0,
    });
    expect(lerpPos(undefined, 3, 4, 0.5, 0.5)).toEqual({ x: 3, y: 4, z: 0.5 });
  });
});

describe('Stalker target flash (C3)', () => {
  it('flashes for ~2 s from the pick, then nothing', () => {
    expect(HUNT_FLASH_MS).toBe(2000);
    expect(huntFlashLevel(0)).toBeCloseTo(1);
    expect(huntFlashLevel(-1)).toBe(0);
    expect(huntFlashLevel(HUNT_FLASH_MS)).toBe(0);
    expect(huntFlashLevel(60_000)).toBe(0);
    const lit = Array.from({ length: 40 }, (_, i) => huntFlashLevel(i * 50));
    expect(lit.every((l) => l > 0 && l <= 1)).toBe(true);
    // It pulses (several flashes), not one flat glow.
    const peaks = lit.filter((l, i) => i > 0 && i < 39 && l > lit[i - 1]! && l >= lit[i + 1]!);
    expect(peaks.length).toBeGreaterThanOrEqual(3);
  });
});
