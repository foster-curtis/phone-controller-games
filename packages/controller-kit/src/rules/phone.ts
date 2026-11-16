// Rules overview phone screen (PLATFORM decision #12): everyone sees "Watch the TV"; the leader also
// gets Next and Skip (Skip hidden on the last card, where Next reads "Let's play!"). The model is pure;
// the DOM screen takes the game's own button / text builders so it matches each brand.
// Frozen at H0 (how-to-play): additive changes only. Wire messages stay in each game's messages.ts.

export type RulesPhoneAction = 'next' | 'skip';

/** What the host's `rules` screen carries for this phone. */
export interface RulesPhoneState {
  /** 0-based card index. */
  card: number;
  cards: number;
  isLeader: boolean;
}

export interface RulesPhoneButton {
  label: string;
  action: RulesPhoneAction;
  /** Stable id for tests and e2e (`next` / `skip`). */
  id: RulesPhoneAction;
  /** Secondary style (Skip). */
  quiet: boolean;
}

export interface RulesPhoneModel {
  heading: string;
  /** "Card 2 of 6". */
  caption: string;
  /** Always "Watch the TV" (a game may hide it for the leader, as Say Cheese does). */
  watch: string;
  /** Leader only. */
  next: RulesPhoneButton | null;
  /** Leader only, and not on the last card. */
  skip: RulesPhoneButton | null;
}

export const RULES_PHONE_HEADING = 'How to play';
export const RULES_PHONE_WATCH = 'Watch the TV';

export function rulesPhoneModel(s: RulesPhoneState): RulesPhoneModel {
  const cards = Math.max(1, s.cards);
  const card = Math.min(Math.max(s.card, 0), cards - 1);
  const last = card >= cards - 1;
  return {
    heading: RULES_PHONE_HEADING,
    caption: `Card ${card + 1} of ${cards}`,
    watch: RULES_PHONE_WATCH,
    next: s.isLeader
      ? { label: last ? "Let's play!" : 'Next', action: 'next', id: 'next', quiet: false }
      : null,
    skip: s.isLeader && !last ? { label: 'Skip', action: 'skip', id: 'skip', quiet: true } : null,
  };
}

export interface RulesPhoneScreenOptions {
  /** Leader tapped Next / Skip; the game sends its own leader message. */
  onAction(action: RulesPhoneAction): void;
  /** The game's button builder (default: a plain `<button>` with `id`). */
  button?(b: RulesPhoneButton, onClick: () => void): HTMLElement;
  /** The game's heading builder (default `<h1>`). */
  heading?(text: string): HTMLElement;
  /** The game's text builder (default `<p class="caption|body">`). */
  text?(text: string, kind: 'caption' | 'body'): HTMLElement;
  /** Root classes (default `screen rules`); the root also gets `data-screen="rules"`. */
  className?: string;
}

export interface RulesPhoneScreen {
  readonly element: HTMLElement;
  /** Re-renders only when the model changed. */
  update(s: RulesPhoneState): void;
  destroy(): void;
}

export function createRulesPhoneScreen(
  initial: RulesPhoneState,
  opts: RulesPhoneScreenOptions,
): RulesPhoneScreen {
  const root = document.createElement('section');
  root.className = opts.className ?? 'screen rules';
  root.dataset.screen = 'rules';

  const defaultButton = (b: RulesPhoneButton, onClick: () => void): HTMLElement => {
    const el = document.createElement('button');
    el.type = 'button';
    el.id = b.id;
    el.textContent = b.label;
    el.addEventListener('click', onClick);
    return el;
  };
  const defaultHeading = (text: string): HTMLElement => {
    const el = document.createElement('h1');
    el.textContent = text;
    return el;
  };
  const defaultText = (text: string, kind: 'caption' | 'body'): HTMLElement => {
    const el = document.createElement('p');
    el.className = kind;
    el.textContent = text;
    return el;
  };

  let last = '';
  const render = (s: RulesPhoneState): void => {
    const m = rulesPhoneModel(s);
    const key = JSON.stringify(m);
    if (key === last) return;
    last = key;
    const kids: HTMLElement[] = [
      (opts.heading ?? defaultHeading)(m.heading),
      (opts.text ?? defaultText)(m.caption, 'caption'),
      (opts.text ?? defaultText)(m.watch, 'body'),
    ];
    if (m.next) {
      const row = document.createElement('div');
      row.className = 'leader-row';
      const mkBtn = (b: RulesPhoneButton): HTMLElement =>
        (opts.button ?? defaultButton)(b, () => opts.onAction(b.action));
      row.append(mkBtn(m.next));
      if (m.skip) row.append(mkBtn(m.skip));
      kids.push(row);
    }
    root.replaceChildren(...kids);
  };
  render(initial);

  return {
    element: root,
    update: render,
    destroy() {
      root.remove();
    },
  };
}
