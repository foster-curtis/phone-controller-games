// Feedback survey on the match end (SPEC §6.6; PLATFORM decision #11): the pre-filled form link for
// this game as a QR in a corner of the view, clear of the podium and standings (tv.css).
import { feedbackUrl } from '@pcg/catalog';
import { qrMatrix, type QrMatrix } from '@pcg/game-kit';
import { GAME_ID } from '../../shared/messages';
import { h } from './dom';
import { qrSvgOf } from './lobby';

export const FEEDBACK_URL = feedbackUrl(GAME_ID);

let qr: QrMatrix | null = null;

/** Error level L: a lit screen can't smudge, and L keeps the long form URL at 41 modules a side. */
export function feedbackQr(): QrMatrix {
  return (qr ??= qrMatrix(FEEDBACK_URL, 'L'));
}

export function feedbackPanel(): HTMLElement {
  const panel = h('div', 'feedback');
  panel.dataset.feedback = '';
  panel.append(
    qrSvgOf(feedbackQr(), 'QR code to give feedback'),
    h('p', 'pad', 'Tell us what you thought!'),
    h('p', 'caption', 'Scan to give feedback (~5 min)'),
  );
  return panel;
}
