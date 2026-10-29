// QR helper: the join link as a module matrix the host draws itself (Phaser graphics, canvas, DOM).
import { create } from 'qrcode';

export interface QrMatrix {
  /** Modules per side. */
  size: number;
  /** Row-major, `size * size` entries, 1 = dark. */
  modules: number[];
}

export function qrMatrix(
  text: string,
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H' = 'M',
): QrMatrix {
  const { size, data } = create(text, { errorCorrectionLevel }).modules;
  return { size, modules: Array.from(data, (v) => (v ? 1 : 0)) };
}
