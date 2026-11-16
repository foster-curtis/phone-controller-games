import type { RulesAction } from '@pcg/game-kit';
import type * as Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { RULES_CARD_COUNT } from '../cards';

const mounted: {
  onAction(a: RulesAction): void;
  show: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}[] = [];

vi.mock('../overlay', () => ({
  mountRulesOverlay: (_game: unknown, opts: { onAction(a: RulesAction): void }) => {
    const o = { onAction: opts.onAction, show: vi.fn(), destroy: vi.fn() };
    mounted.push(o);
    return o;
  },
}));

const { openRulesPreview } = await import('../preview');

describe('openRulesPreview', () => {
  it('shows the card, steps with next (wrapping) and closes on skip', () => {
    mounted.length = 0;
    const game = { isBooted: true } as unknown as Phaser.Game;
    openRulesPreview(game, RULES_CARD_COUNT - 1, 5);
    const o = mounted[0]!;
    const ctx = { playerCount: 5 };
    expect(o.show).toHaveBeenLastCalledWith({ card: RULES_CARD_COUNT - 1, cards: 6 }, ctx);
    o.onAction('next');
    expect(o.show).toHaveBeenLastCalledWith({ card: 0, cards: 6 }, ctx);
    o.onAction('next');
    expect(o.show).toHaveBeenLastCalledWith({ card: 1, cards: 6 }, ctx);
    o.onAction('skip');
    expect(o.destroy).toHaveBeenCalledOnce();
  });

  it('waits for the game to boot', () => {
    mounted.length = 0;
    let ready: (() => void) | undefined;
    const game = {
      isBooted: false,
      events: { once: (_e: string, fn: () => void) => void (ready = fn) },
    } as unknown as Phaser.Game;
    openRulesPreview(game, 2, 4);
    expect(mounted).toHaveLength(0);
    ready!();
    expect(mounted).toHaveLength(1);
    expect(mounted[0]!.show).toHaveBeenCalledWith({ card: 2, cards: 6 }, { playerCount: 4 });
  });
});
