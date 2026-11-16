// Rules overview DOM card shell (PLATFORM decision #12): title, body, optional note, an illustration
// slot, a progress-dots row, a controls hint, and keyboard / gamepad Next / Skip. Styled only through
// the CSS custom properties in RULES_SHELL_VARS (each game sets them from its brand tokens).
// Frozen at H0 (how-to-play): additive changes only. DOM is read lazily (never on import).
import type { RulesAction, RulesCard, RulesCardContext } from './types';

/** Parts of the shell that take extra classes (`classes` option), e.g. a game's existing test hooks. */
export type RulesShellPart =
  | 'root'
  | 'slot'
  | 'title'
  | 'body'
  | 'note'
  | 'dots'
  | 'dot'
  | 'dotOn'
  | 'hint'
  | 'buttons'
  | 'button';

/**
 * CSS custom properties the shell's default stylesheet reads (set them on the root or an ancestor).
 * Colors and fonts have neutral fallbacks; games set them from brand.css.
 */
export const RULES_SHELL_VARS = [
  '--pcg-rules-bg',
  '--pcg-rules-fg',
  '--pcg-rules-muted',
  '--pcg-rules-accent',
  '--pcg-rules-title-font',
  '--pcg-rules-title-size',
  '--pcg-rules-body-font',
  '--pcg-rules-body-size',
  '--pcg-rules-note-size',
  '--pcg-rules-hint-size',
  '--pcg-rules-gap',
  '--pcg-rules-pad',
  '--pcg-rules-radius',
  '--pcg-rules-slot-aspect',
  '--pcg-rules-slot-max-height',
  '--pcg-rules-dot-size',
  '--pcg-rules-dot',
  '--pcg-rules-dot-on',
] as const;

export type KeyTarget = Pick<Document, 'addEventListener' | 'removeEventListener'>;

/** Injected for tests; defaults read the browser globals lazily. */
export interface RulesShellEnv {
  document: Document;
  /** Gamepad polling; return [] when unsupported. */
  getGamepads(): readonly (Gamepad | null)[];
  requestAnimationFrame(cb: (t: number) => void): number;
  cancelAnimationFrame(id: number): void;
  /** `prefers-reduced-motion: reduce`. */
  prefersReducedMotion(): boolean;
}

export interface RulesShellOptions {
  cards: readonly RulesCard[];
  /**
   * Host keyboard / gamepad / button Next or Skip. The game routes it into its match (the host may
   * always advance; leader gating applies to phones).
   */
  onAction(action: RulesAction): void;
  /** Controls hint under the dots. Default RULES_HINT ("Leader: Next / Skip"). */
  hint?: string;
  /** Enter / → / Space = Next, Esc = Skip on `document` (or the given target). Default true. */
  keys?: boolean | KeyTarget;
  /** Gamepad A / Start = Next, B = Skip (edge-triggered). Default true. */
  gamepad?: boolean;
  /** Clickable Next / Skip buttons on the card (never the only way: keys and the phone work too). Default false. */
  buttons?: boolean;
  /** Overrides `prefers-reduced-motion`. */
  reducedMotion?: boolean;
  /** Extra classes per part, added next to the shell's own `pcg-rules*` classes. */
  classes?: Partial<Record<RulesShellPart, string>>;
  env?: Partial<RulesShellEnv>;
}

export interface RulesShell {
  /** The shell's root; the game places it (e.g. over its canvas or in its view container). */
  readonly element: HTMLElement;
  /** The illustration slot (a canvas-backed illustration measures this to place its camera). */
  readonly slot: HTMLElement;
  /**
   * Shows card `view.card` (clamped) of `view.cards` dots. Text is re-resolved on every call; the
   * illustration is mounted only when the card index changes (or on the first call).
   */
  show(view: { card: number; cards: number }, ctx: RulesCardContext): void;
  /** The card currently shown, or -1 before the first `show`. */
  readonly card: number;
  /** Destroys the current illustration, removes listeners and the element. Idempotent. */
  destroy(): void;
}

export function createRulesShell(_opts: RulesShellOptions): RulesShell {
  throw new Error('createRulesShell: not implemented (H1)');
}
