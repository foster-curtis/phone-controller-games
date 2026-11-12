// @vitest-environment jsdom
// Match-end feedback QR (SPEC §6.6; PLATFORM decision #11): the encoded URL, and only the match end
// draws it.
import * as gameKit from '@pcg/game-kit';
import { describe, expect, it, vi } from 'vitest';
import { noopSfx } from '../../../shared/sfx';
import { galleryViews } from '../../gallery';
import { renderTv } from '..';
import { FEEDBACK_URL, feedbackQr } from '../feedback';
import { qrSvgOf } from '../lobby';

// Watch what reaches the QR generator.
vi.mock('@pcg/game-kit', async (orig) => {
  const real = await orig<typeof gameKit>();
  return { ...real, qrMatrix: vi.fn(real.qrMatrix) };
});

const controls = { emit: () => {}, sfx: noopSfx, origin: 'https://example.test' };

describe('match-end feedback QR', () => {
  it('encodes the form pre-filled for Say Cheese', () => {
    expect(FEEDBACK_URL).toBe(
      'https://docs.google.com/forms/d/e/1FAIpQLSdPubA2byBsxMQwW150t_6hfZ8tZno02ZdCDnrVDpBAqcwtCg/viewform?usp=pp_url&entry.222963833=Yes',
    );
    const qr = feedbackQr();
    expect(gameKit.qrMatrix).toHaveBeenCalledWith(FEEDBACK_URL, 'L');
    expect(qr.size).toBe(41);
  });

  it('draws that QR on the match end and on no other screen', () => {
    for (const v of galleryViews()) {
      const root = document.createElement('div');
      renderTv(root, v, controls);
      const panel = root.querySelector('[data-feedback]');
      if (v.phase !== 'matchEnd') {
        expect(panel, v.phase).toBeNull();
        continue;
      }
      const svg = panel!.querySelector('svg')!;
      expect(svg.outerHTML).toBe(qrSvgOf(feedbackQr(), 'QR code to give feedback').outerHTML);
      // The host controls stay where they were: the panel adds no buttons.
      expect(panel!.querySelector('button, a')).toBeNull();
      expect(root.querySelector('[data-action=rematch]')).not.toBeNull();
    }
  });
});
