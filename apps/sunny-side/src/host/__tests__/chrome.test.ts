import { describe, expect, it } from 'vitest';
import { fullscreenButtonVisible } from '../chrome';

describe('host full-screen button visibility', () => {
  it('shows on the lobby and between-round menus', () => {
    for (const phase of ['lobby', 'results', 'matchEnd'] as const) {
      expect(fullscreenButtonVisible(phase, false)).toBe(true);
    }
  });

  it('stays hidden during the overview, countdown and play, but shows while paused', () => {
    for (const phase of ['rules', 'countdown', 'playing'] as const) {
      expect(fullscreenButtonVisible(phase, false)).toBe(false);
      expect(fullscreenButtonVisible(phase, true)).toBe(true);
    }
  });
});
