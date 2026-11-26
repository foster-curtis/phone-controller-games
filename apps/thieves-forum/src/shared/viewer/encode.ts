// Tip-off snapshot encoder (SPEC §6.13, §12.6): one still frame of the TV canvas → a JPEG no longer than
// `maxW` on its long edge, plus the `HitArea`s of every character but the tipper's own. Quality 0.6,
// re-encoded at 0.45 when the first try is over 90 KB, so a busy frame still fits a few relay chunks.
// Browser-only (canvas); no game imports (extraction candidate, BUILD_PLAN §8). The caller passes the
// source: a 2D canvas, or the image from Phaser's `renderer.snapshot` for a WebGL canvas, whose
// drawing buffer reads blank without `preserveDrawingBuffer` (BUILD_PLAN TF4 risks).
import { type ScreenBox, toHitAreas } from './hits';
import type { HitArea, TipSnapshot } from './types';

/** Long edge of the snapshot in pixels (SPEC §12.6: 960 × 540 from the 1920 × 1080 TV). */
export const SNAPSHOT_LONG_EDGE = 960;
export const SNAPSHOT_QUALITY = 0.6;
export const SNAPSHOT_RETRY_QUALITY = 0.45;
/** Re-encode at `SNAPSHOT_RETRY_QUALITY` above this many bytes. */
export const SNAPSHOT_RETRY_ABOVE = 90 * 1024;

/** Something `drawImage` takes whose size we can read. */
export type SnapshotSource = HTMLCanvasElement | HTMLImageElement | ImageBitmap | OffscreenCanvas;

/** The parts of a canvas the encoder uses (tests pass a fake). */
export interface EncodeCanvas {
  width: number;
  height: number;
  getContext(id: '2d'): Pick<CanvasRenderingContext2D, 'drawImage'> | null;
  toBlob(cb: (blob: Blob | null) => void, type?: string, quality?: number): void;
}

export interface EncodeOptions {
  /** Character screen boxes in source pixels (become `HitArea`s). */
  boxes?: readonly ScreenBox[];
  /** The tipper's own character: no hit area. */
  exclude?: number;
  quality?: number;
  retryQuality?: number;
  retryAbove?: number;
  /** Default: a new `<canvas>`. */
  createCanvas?: () => EncodeCanvas;
}

export interface EncodedSnapshot {
  blob: Blob;
  w: number;
  h: number;
  mime: TipSnapshot['mime'];
  /** The quality of the encode that was kept. */
  quality: number;
  hits: HitArea[];
}

function sourceSize(s: SnapshotSource): { w: number; h: number } {
  if (typeof HTMLImageElement !== 'undefined' && s instanceof HTMLImageElement) {
    return { w: s.naturalWidth, h: s.naturalHeight };
  }
  return { w: s.width, h: s.height };
}

function toBlob(canvas: EncodeCanvas, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('snapshot: toBlob gave nothing'))),
      'image/jpeg',
      quality,
    ),
  );
}

/** Encodes one snapshot of `source`, scaled down so its long edge is at most `maxW`. */
export async function encodeSnapshot(
  source: SnapshotSource,
  maxW: number = SNAPSHOT_LONG_EDGE,
  opts: EncodeOptions = {},
): Promise<EncodedSnapshot> {
  const { w: sw, h: sh } = sourceSize(source);
  if (sw <= 0 || sh <= 0) throw new Error('snapshot: empty source');
  const scale = Math.min(1, maxW / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = opts.createCanvas?.() ?? document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('snapshot: no 2d context');
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);

  let quality = opts.quality ?? SNAPSHOT_QUALITY;
  let blob = await toBlob(canvas, quality);
  const retry = opts.retryQuality ?? SNAPSHOT_RETRY_QUALITY;
  if (blob.size > (opts.retryAbove ?? SNAPSHOT_RETRY_ABOVE) && retry < quality) {
    quality = retry;
    blob = await toBlob(canvas, quality);
  }
  const hits = toHitAreas(opts.boxes ?? [], w / sw, w, h, opts.exclude);
  return { blob, w, h, mime: 'image/jpeg', quality, hits };
}
