// A QR code as Phaser graphics (lobby join link, winner feedback link): ink modules on a cream
// sticker with a quiet zone, the highest-contrast pair in the palette.
import type * as Phaser from 'phaser';
import type { QrMatrix } from '@pcg/game-kit';
import { theme } from '../../shared/theme';

/** Quiet zone in modules on each side (the QR spec's 4). */
export const QR_QUIET = 4;

/** The largest whole-pixel module (`cell`) that fits `qr` plus its quiet zone in `maxBox` px. */
export function qrFit(qr: QrMatrix, maxBox: number): { cell: number; box: number } {
  const n = qr.size + QR_QUIET * 2;
  const cell = Math.floor(maxBox / n);
  return { cell, box: cell * n };
}

/** Draws `qr` with its top-left corner at (x, y), `cell` px per module. */
export function drawQr(
  g: Phaser.GameObjects.Graphics,
  qr: QrMatrix,
  x: number,
  y: number,
  cell: number,
): void {
  const box = cell * (qr.size + QR_QUIET * 2);
  g.fillStyle(theme.color.cream.num, 1);
  g.fillRoundedRect(x, y, box, box, theme.radius.sticker);
  g.fillStyle(theme.color.eggOutline.num, 1);
  const ox = x + cell * QR_QUIET;
  const oy = y + cell * QR_QUIET;
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.modules[r * qr.size + c]) g.fillRect(ox + c * cell, oy + r * cell, cell, cell);
    }
  }
}
