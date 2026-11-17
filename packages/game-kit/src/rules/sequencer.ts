// Rules overview sequencer (PLATFORM decision #12): pure state steps for Next / Skip / finish.
// The game's match state machine calls these; leader gating and when to open stay in the game.
// Frozen at H0 (how-to-play): additive changes only.
import type {
  RulesAction,
  RulesCard,
  RulesCardContext,
  RulesOverviewState,
  RulesSource,
  RulesStepResult,
  RulesText,
} from './types';

export const RULES_NEXT_LABEL = 'Next';
/** The last card's Next (Say Cheese SPEC §6.2.1: the same whether opened from Start or the lobby). */
export const RULES_FINISH_LABEL = "Let's play!";
export const RULES_SKIP_LABEL = 'Skip';
/** Default TV controls hint. */
export const RULES_HINT = 'Leader: Next / Skip';

export function isRulesAction(v: unknown): v is RulesAction {
  return v === 'next' || v === 'skip';
}

/** Opens the overview on its first card. `cards` must be ≥ 1. */
export function openRulesOverview(source: RulesSource, cards: number): RulesOverviewState {
  if (!Number.isInteger(cards) || cards < 1) throw new Error(`rules overview needs ≥ 1 card`);
  return { source, card: 0, cards };
}

/** Next moves one card on (finishing after the last); Skip finishes from any card. */
export function stepRulesOverview(state: RulesOverviewState, action: RulesAction): RulesStepResult {
  if (action === 'skip') return { done: true, source: state.source, skipped: true };
  if (state.card + 1 >= state.cards) return { done: true, source: state.source, skipped: false };
  return { done: false, state: { ...state, card: state.card + 1 } };
}

export function isLastRulesCard(s: { card: number; cards: number }): boolean {
  return s.card >= s.cards - 1;
}

/** "Next", or "Let's play!" on the last card. */
export function rulesNextLabel(s: { card: number; cards: number }): string {
  return isLastRulesCard(s) ? RULES_FINISH_LABEL : RULES_NEXT_LABEL;
}

/** `card` clamped into `0..cards.length - 1` (a stale or restored index never throws). */
export function clampRulesCard(card: number, cards: number): number {
  if (cards < 1) return 0;
  return Math.min(Math.max(Math.trunc(card) || 0, 0), cards - 1);
}

export function resolveRulesText(text: RulesText, ctx: RulesCardContext): string {
  return typeof text === 'function' ? text(ctx) : text;
}

/** A card's title, body and note as plain strings for this context. */
export function resolveRulesCard(
  card: RulesCard,
  ctx: RulesCardContext,
): { title: string; body: string; note: string | null } {
  return {
    title: card.title,
    body: resolveRulesText(card.body, ctx),
    note: card.note === undefined ? null : resolveRulesText(card.note, ctx),
  };
}
