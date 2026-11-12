// Feedback survey on the run summary (SPEC §4; PLATFORM decision #11): the pre-filled form link for
// this game as a QR in the top-right corner, where the lobby's join QR sits.
import { feedbackUrl } from '@pcg/catalog';
import { qrMatrix, type QrMatrix } from '@pcg/game-kit';
import { GAME_ID } from '../../shared/messages';
import { qrSvg } from './html';

export const FEEDBACK_URL = feedbackUrl(GAME_ID);

let qr: QrMatrix | null = null;

/** Error level L: a lit screen can't smudge, and L keeps the long form URL at 41 modules a side. */
export function feedbackQr(): QrMatrix {
  return (qr ??= qrMatrix(FEEDBACK_URL, 'L'));
}

export function feedbackHtml(): string {
  return (
    `<div class="feedback" data-feedback>` +
    `<div class="qrbox">${qrSvg(feedbackQr(), 'QR code to give feedback')}</div>` +
    `<div class="tag fb-head">Tell us what you thought!</div>` +
    `<div class="body muted">Scan to give feedback (~5 min)</div>` +
    `</div>`
  );
}
