// Debug preview (SPEC §6.9): `?debug=1&howto=<card 1-6>[&players=<n>]` on the host opens the How to
// play overview on that card without a room, so a preview can jump straight to any illustration.
// Next / Skip (keys, gamepad) step through the cards locally; Skip closes the preview.
import type * as Phaser from 'phaser';
import { RULES_CARD_COUNT } from './cards';
import { mountRulesOverlay } from './overlay';

/** The 0-based card asked for by `?howto=`, or null when absent or out of range. */
export function previewCardFromSearch(search: string, cards: number): number | null {
  const raw = new URLSearchParams(search).get('howto');
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > cards) return null;
  return n - 1;
}

/** `?players=` for the scoring card's target (default 4). */
export function previewPlayersFromSearch(search: string): number {
  const n = Number(new URLSearchParams(search).get('players'));
  return Number.isInteger(n) && n >= 1 ? n : 4;
}

/** `?t=<ms>` freezes each illustration at that loop time, for screenshots; null when absent. */
export function previewTimeFromSearch(search: string): number | null {
  const raw = new URLSearchParams(search).get('t');
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Opens the overview on `card` (0-based) over whatever scene is showing; waits for the game to boot. */
export function openRulesPreview(game: Phaser.Game, card: number, playerCount: number): void {
  const ctx = { playerCount };
  const freezeMs = previewTimeFromSearch(globalThis.location?.search ?? '') ?? undefined;
  const open = () => {
    let current = card;
    const show = () => overlay.show({ card: current, cards: RULES_CARD_COUNT }, ctx);
    const overlay = mountRulesOverlay(game, {
      backdrop: true,
      freezeMs,
      onAction(action) {
        if (action === 'next') {
          current = (current + 1) % RULES_CARD_COUNT;
          show();
        } else overlay.destroy();
      },
    });
    show();
  };
  if (game.isBooted) open();
  else game.events.once('ready', open);
}
