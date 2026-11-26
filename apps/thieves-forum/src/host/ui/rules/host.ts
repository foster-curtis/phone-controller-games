// How to play on the TV (SPEC §6.19, §12.2): the kit's card shell with this game's styling through
// `--pcg-rules-*` (set in tv.css from brand tokens). Keys and gamepad run inside the shell, so the
// host can always advance; the leader phone's Next / Skip arrive as `show` calls from the match.
// The cards are TF15's (`src/content/rules.ts`); `placeholder.ts` is the dev-only fallback until then.
import { createRulesShell, type RulesAction, type RulesCard, type RulesShell } from '@pcg/game-kit';

export interface RulesHost {
  readonly element: HTMLElement;
  show(card: number, count: number, playerCount: number): void;
  destroy(): void;
}

export function createRulesHost(
  cards: readonly RulesCard[],
  onAction: (a: RulesAction) => void,
  env?: Parameters<typeof createRulesShell>[0]['env'],
): RulesHost {
  const shell: RulesShell = createRulesShell({
    cards,
    onAction,
    buttons: true,
    classes: { root: 'tv-rules', title: 'h2', body: 'body' },
    ...(env ? { env } : {}),
  });
  return {
    element: shell.element,
    show: (card, count, playerCount) => shell.show({ card, cards: count }, { playerCount }),
    destroy: () => shell.destroy(),
  };
}
