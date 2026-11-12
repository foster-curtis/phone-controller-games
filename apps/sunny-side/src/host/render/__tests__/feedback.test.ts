// Winner-screen feedback QR (SPEC §6.6; PLATFORM decision #11): the encoded URL, the matrix and the
// panel's place on the TV.
import { create } from 'qrcode';
import { describe, expect, it } from 'vitest';
import { FEEDBACK_URL, feedbackQr } from '../feedback';
import { breakdownLayout, insideSafe, overlaps, winnerLayout } from '../layout';
import { qrFit } from '../qr';

describe('winner feedback QR', () => {
  it('encodes the form pre-filled for Sunny Side', () => {
    expect(FEEDBACK_URL).toBe(
      'https://docs.google.com/forms/d/e/1FAIpQLSdPubA2byBsxMQwW150t_6hfZ8tZno02ZdCDnrVDpBAqcwtCg/viewform?usp=pp_url&entry.1611048359=Yes',
    );
    const expected = create(FEEDBACK_URL, { errorCorrectionLevel: 'L' }).modules;
    const qr = feedbackQr();
    expect(qr.size).toBe(expected.size);
    expect(qr.modules).toEqual(Array.from(expected.data, (v) => (v ? 1 : 0)));
  });

  it('fits a big, scannable QR in a panel beside the breakdown', () => {
    const L = winnerLayout();
    for (const r of [L.breakdown, L.feedback, L.caption, L.qrMax])
      expect(insideSafe(r), JSON.stringify(r)).toBe(true);
    expect(overlaps(L.caption, L.qrMax)).toBe(false);
    for (const n of [2, 8]) {
      for (const compact of [false, true]) {
        const bd = breakdownLayout(n, L.breakdown, compact);
        expect(overlaps(bd.panel, L.feedback)).toBe(false);
        // The reasons column still holds a "KO <name> +1" line (compact rows have none).
        if (!compact) for (const row of bd.rows) expect(row.items.w).toBeGreaterThanOrEqual(180);
      }
    }
    // 9 px modules: close to the lobby join QR's 11 px, so it scans from the couch.
    const { cell, box } = qrFit(feedbackQr(), L.qrMax.w);
    expect(cell).toBeGreaterThanOrEqual(9);
    expect(box).toBeLessThanOrEqual(L.qrMax.w);
  });
});
