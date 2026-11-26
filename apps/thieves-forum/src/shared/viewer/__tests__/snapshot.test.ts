// Tip-off snapshot geometry and encoder (SPEC §6.13, §12.6; BUILD_PLAN TF4 acceptance): hit areas scale
// with the image and leave out the tipper, a tap picks the nearest box and never the tipper's own, the
// fit keeps the whole image, and the encoder retries at a lower quality above 90 KB.
import { describe, expect, it } from 'vitest';
import {
  type EncodeCanvas,
  encodeSnapshot,
  SNAPSHOT_QUALITY,
  SNAPSHOT_RETRY_ABOVE,
  SNAPSHOT_RETRY_QUALITY,
  type SnapshotSource,
} from '../encode';
import { fitContain, nearestHit, TAP_SLOP_PX, toHitAreas } from '../hits';
import type { HitArea } from '../types';

describe('toHitAreas', () => {
  it('scales boxes, clips to the image, drops off-image boxes and the excluded one', () => {
    const boxes = [
      { id: 1, x: 100, y: 200, w: 80, h: 120 },
      { id: 2, x: -40, y: 1000, w: 80, h: 120 }, // clipped on the left and bottom
      { id: 3, x: 2000, y: 0, w: 80, h: 120 }, // off the right edge
      { id: 4, x: 500, y: 500, w: 80, h: 120 }, // the tipper
    ];
    expect(toHitAreas(boxes, 0.5, 960, 540, 4)).toEqual([
      { targetId: 1, x: 50, y: 100, w: 40, h: 60 },
      { targetId: 2, x: 0, y: 500, w: 20, h: 40 },
    ]);
  });
});

describe('nearestHit', () => {
  const hits: HitArea[] = [
    { targetId: 1, x: 100, y: 100, w: 40, h: 60 },
    { targetId: 2, x: 130, y: 100, w: 40, h: 60 }, // overlaps 1
    { targetId: 3, x: 400, y: 300, w: 40, h: 60 },
    { targetId: 9, x: 600, y: 300, w: 40, h: 60 }, // the tipper's own
  ];

  it('picks the box under the tap, by nearest center where boxes overlap', () => {
    expect(nearestHit(hits, 110, 120)?.targetId).toBe(1);
    expect(nearestHit(hits, 160, 120)?.targetId).toBe(2);
    expect(nearestHit(hits, 134, 130)?.targetId).toBe(1);
    expect(nearestHit(hits, 136, 130)?.targetId).toBe(2);
  });

  it('picks the nearest box within the slop, and nothing beyond it', () => {
    expect(nearestHit(hits, 400 - 10, 330)?.targetId).toBe(3);
    expect(nearestHit(hits, 400 - TAP_SLOP_PX - 1, 330)).toBeNull();
    expect(nearestHit(hits, 800, 50)).toBeNull();
  });

  it('never picks the excluded character, even on a direct tap', () => {
    expect(nearestHit(hits, 620, 330, 9)).toBeNull();
    expect(nearestHit(hits, 600 - 20, 330, 9)).toBeNull();
    // Between 3 and the tipper: 3 is farther but the only choice.
    expect(nearestHit(hits, 470, 330, 9)?.targetId).toBe(3);
    expect(nearestHit(hits, 580, 330, 9, 200)?.targetId).toBe(3);
  });
});

describe('fitContain', () => {
  it('fits a 16:9 image into a landscape phone stage, centered', () => {
    expect(fitContain(960, 540, 844, 300)).toEqual({
      x: (844 - (960 * 300) / 540) / 2,
      y: 0,
      w: (960 * 300) / 540,
      h: 300,
      scale: 300 / 540,
    });
    const tall = fitContain(960, 540, 400, 800);
    expect(tall.w).toBeCloseTo(400);
    expect(tall.y).toBeCloseTo((800 - 225) / 2);
  });
});

/** A fake canvas whose JPEG size depends on the quality asked for. */
function fakeCanvas(sizeAt: (q: number) => number) {
  const calls: { w: number; h: number; quality: number }[] = [];
  const canvas: EncodeCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => undefined }),
    toBlob(cb, _type, quality = 0.92) {
      calls.push({ w: this.width, h: this.height, quality });
      cb(new Blob([new Uint8Array(sizeAt(quality))], { type: 'image/jpeg' }));
    },
  };
  return { canvas, calls };
}

const tv = { width: 1920, height: 1080 } as unknown as SnapshotSource;

describe('encodeSnapshot', () => {
  it('scales the long edge to 960 and keeps quality 0.6 under 90 KB', async () => {
    const { canvas, calls } = fakeCanvas(() => 50_000);
    const boxes = [{ id: 1, x: 100, y: 100, w: 80, h: 120 }];
    const out = await encodeSnapshot(tv, 960, { boxes, createCanvas: () => canvas });
    expect(out).toMatchObject({ w: 960, h: 540, quality: SNAPSHOT_QUALITY, mime: 'image/jpeg' });
    expect(out.hits).toEqual([{ targetId: 1, x: 50, y: 50, w: 40, h: 60 }]);
    expect(calls).toEqual([{ w: 960, h: 540, quality: 0.6 }]);
  });

  it('retries at 0.45 when the first encode is over 90 KB', async () => {
    const { canvas, calls } = fakeCanvas((q) => (q > 0.5 ? SNAPSHOT_RETRY_ABOVE + 1 : 70_000));
    const out = await encodeSnapshot(tv, 960, { createCanvas: () => canvas, exclude: 1 });
    expect(calls.map((c) => c.quality)).toEqual([0.6, SNAPSHOT_RETRY_QUALITY]);
    expect(out.quality).toBe(SNAPSHOT_RETRY_QUALITY);
    expect(out.blob.size).toBe(70_000);
  });

  it('honors a lower long edge (slow relay fallback) and never upscales', async () => {
    const { canvas } = fakeCanvas(() => 10);
    expect(await encodeSnapshot(tv, 800, { createCanvas: () => canvas })).toMatchObject({
      w: 800,
      h: 450,
    });
    const small = { width: 640, height: 360 } as unknown as SnapshotSource;
    expect(await encodeSnapshot(small, 960, { createCanvas: () => canvas })).toMatchObject({
      w: 640,
      h: 360,
    });
  });
});
