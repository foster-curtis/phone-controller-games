// Rules overview ("How to play") contract (PLATFORM §4, decision #12). The kit owns the process
// (sequencer, DOM card shell); each game owns its cards: copy, illustrations and styling.
// Frozen at H0 (how-to-play): additive changes only. No Phaser, no game imports.

/** Why the overview opened: the room's first Start (then the match begins) or the lobby's How to play. */
export type RulesSource = 'firstStart' | 'lobby';

/** What the leader's phone and the host's controls can do on a card. */
export type RulesAction = 'next' | 'skip';

/** Live facts a card's text may depend on. */
export interface RulesCardContext {
  /** Players the match counts (for "First to {target} wins"). */
  playerCount: number;
}

/** Text that is fixed, or computed from the live context each time the card is shown. */
export type RulesText = string | ((ctx: RulesCardContext) => string);

/** A mounted illustration; `destroy` must leave nothing running (timers, listeners, scenes). */
export interface RulesIllustrationHandle {
  destroy(): void;
}

/** A card's picture. The shell hands it the slot element; what it draws there is the game's. */
export interface RulesIllustration {
  mount(slot: HTMLElement, opts: { reducedMotion: boolean }): RulesIllustrationHandle;
}

/** One idea per card: a title, a body line, optional small print, and an illustration. */
export interface RulesCard {
  title: string;
  body: RulesText;
  /** Small print under the body (optional). */
  note?: RulesText;
  illustration: RulesIllustration;
}

/** Where an open overview is. Plain data, so a game's match state can hold and persist it. */
export interface RulesOverviewState {
  readonly source: RulesSource;
  /** 0-based card index. */
  readonly card: number;
  readonly cards: number;
}

/** Result of a Next / Skip: the next card, or the overview is over (the game decides what follows). */
export type RulesStepResult =
  | { readonly done: false; readonly state: RulesOverviewState }
  | { readonly done: true; readonly source: RulesSource; readonly skipped: boolean };
