// Run-summary feedback QR (SPEC §4; PLATFORM decision #11): the encoded URL, and only the summary
// screen draws it.
import { create } from 'qrcode';
import { describe, expect, it } from 'vitest';
import { FEEDBACK_URL, feedbackQr } from '../feedback';
import { qrSvg } from '../html';
import { sectionsFor } from '../render';
import { UI_SCREENS, sampleView } from '../samples';
import { summarySections } from '../screens/summary';

const html = (name: (typeof UI_SCREENS)[number]) =>
  sectionsFor(sampleView(name), { hit: false, armedSlot: null })
    .map((s) => s.html)
    .join('');

describe('summary feedback QR', () => {
  it('encodes the form pre-filled for Fort Frenzy', () => {
    expect(FEEDBACK_URL).toBe(
      'https://docs.google.com/forms/d/e/1FAIpQLSdPubA2byBsxMQwW150t_6hfZ8tZno02ZdCDnrVDpBAqcwtCg/viewform?usp=pp_url&entry.1921122279=Yes',
    );
    const expected = create(FEEDBACK_URL, { errorCorrectionLevel: 'L' }).modules;
    const qr = feedbackQr();
    expect(qr.size).toBe(expected.size);
    expect(qr.modules).toEqual(Array.from(expected.data, (v) => (v ? 1 : 0)));
  });

  it('draws that QR on the summary screen and on no other', () => {
    expect(html('summary')).toContain(qrSvg(feedbackQr(), 'QR code to give feedback'));
    // The victory/defeat samples reuse the summary's data; live, the team view carries a summary only
    // in the summary phase (net/views.ts), and with none the screen draws nothing.
    const end = sampleView('victory');
    expect(summarySections({ ...end, team: { ...end.team!, summary: null } })).toEqual([]);
    for (const name of UI_SCREENS.filter((n) => !['summary', 'victory', 'defeat'].includes(n)))
      expect(html(name), name).not.toContain('data-feedback');
  });
});
