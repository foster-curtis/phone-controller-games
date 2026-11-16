// Debug preview (SPEC §6.9): `?debug=1&howto=<card 1-6>[&players=<n>]` on the host opens the How to
// play overview on that card without a room, so a preview can jump straight to any illustration.
// Next / Skip (keys, gamepad) step through the cards locally. H0 stub; H3a implements it.
import type * as Phaser from 'phaser';

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

export function openRulesPreview(_game: Phaser.Game, _card: number, _playerCount: number): void {
  // H3a: mount the kit shell over the canvas with rulesCards(createStage(game)).
}
