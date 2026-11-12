// Feedback survey on the match winner screen (SPEC §6.6; PLATFORM decision #11): the pre-filled form
// link for this game and its QR. No Phaser, so tests can check the exact URL that is encoded.
import { feedbackUrl } from '@pcg/catalog';
import { qrMatrix, type QrMatrix } from '@pcg/game-kit';
import { GAME_ID } from '../../shared/messages';

export const FEEDBACK_URL = feedbackUrl(GAME_ID);
export const FEEDBACK_CAPTION = 'Tell us what you thought!';
export const FEEDBACK_SUBCAPTION = 'Scan to give feedback (~5 min)';

let qr: QrMatrix | null = null;

/** Error level L: a lit screen can't smudge, and L keeps the long form URL at 41 modules a side. */
export function feedbackQr(): QrMatrix {
  return (qr ??= qrMatrix(FEEDBACK_URL, 'L'));
}
