// Rules overview DOM card shell (PLATFORM decision #12): title, body, optional note, an illustration
// slot, a progress-dots row, a controls hint, and keyboard / gamepad Next / Skip. Styled only through
// the CSS custom properties in RULES_SHELL_VARS (each game sets them from its brand tokens).
// Frozen at H0 (how-to-play): additive changes only. DOM is read lazily (never on import).
import {
  clampRulesCard,
  resolveRulesCard,
  rulesNextLabel,
  RULES_HINT,
  RULES_SKIP_LABEL,
} from './sequencer';
import type { RulesAction, RulesCard, RulesCardContext, RulesIllustrationHandle } from './types';

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

const STYLE_ID = 'pcg-rules-style';

const STYLE = `
.pcg-rules{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;box-sizing:border-box;width:100%;height:100%;gap:var(--pcg-rules-gap,1rem);padding:var(--pcg-rules-pad,1.5rem);background:var(--pcg-rules-bg,transparent);color:var(--pcg-rules-fg,currentColor);font-family:var(--pcg-rules-body-font,system-ui,sans-serif)}
.pcg-rules__slot{width:100%;max-width:100%;aspect-ratio:var(--pcg-rules-slot-aspect,16/9);max-height:var(--pcg-rules-slot-max-height,50vh);border-radius:var(--pcg-rules-radius,0);overflow:hidden;position:relative}
.pcg-rules__title{margin:0;font-family:var(--pcg-rules-title-font,system-ui,sans-serif);font-size:var(--pcg-rules-title-size,2rem);line-height:1.15}
.pcg-rules__body{margin:0;max-width:40ch;font-size:var(--pcg-rules-body-size,1.25rem);line-height:1.35}
.pcg-rules__note{margin:0;max-width:48ch;color:var(--pcg-rules-muted,currentColor);opacity:.8;font-size:var(--pcg-rules-note-size,1rem)}
.pcg-rules__note[hidden]{display:none}
.pcg-rules__dots{display:flex;gap:.5rem;justify-content:center}
.pcg-rules__dot{width:var(--pcg-rules-dot-size,.75rem);height:var(--pcg-rules-dot-size,.75rem);border-radius:50%;background:var(--pcg-rules-dot,currentColor);opacity:.35;transition:opacity .2s,transform .2s}
.pcg-rules__dot.is-on{background:var(--pcg-rules-dot-on,var(--pcg-rules-accent,currentColor));opacity:1;transform:scale(1.25)}
.pcg-rules__hint{margin:0;color:var(--pcg-rules-muted,currentColor);opacity:.8;font-size:var(--pcg-rules-hint-size,.875rem)}
.pcg-rules__buttons{display:flex;gap:.75rem;justify-content:center}
.pcg-rules__buttons button{font:inherit;padding:.5rem 1.25rem;border-radius:var(--pcg-rules-radius,.5rem);border:2px solid var(--pcg-rules-accent,currentColor);background:var(--pcg-rules-accent,transparent);color:inherit;cursor:pointer}
.pcg-rules__buttons button[data-action=skip]{background:transparent}
@media (prefers-reduced-motion:reduce){.pcg-rules *{transition:none!important}}
`;

const EDITABLE = 'input,textarea,select,[contenteditable]';

export function createRulesShell(opts: RulesShellOptions): RulesShell {
  const hasNavPads = (): boolean =>
    typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
  const env: RulesShellEnv = {
    document: opts.env?.document ?? document,
    getGamepads:
      opts.env?.getGamepads ?? (() => (hasNavPads() ? Array.from(navigator.getGamepads()) : [])),
    requestAnimationFrame: opts.env?.requestAnimationFrame ?? ((cb) => requestAnimationFrame(cb)),
    cancelAnimationFrame: opts.env?.cancelAnimationFrame ?? ((id) => cancelAnimationFrame(id)),
    prefersReducedMotion:
      opts.env?.prefersReducedMotion ??
      (() =>
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches),
  };
  const doc = env.document;
  const cls = opts.classes ?? {};
  const mk = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    base: string,
    part: RulesShellPart,
  ): HTMLElementTagNameMap[K] => {
    const el = doc.createElement(tag);
    el.className = [base, cls[part]].filter(Boolean).join(' ');
    return el;
  };

  if (!doc.getElementById(STYLE_ID)) {
    const st = doc.createElement('style');
    st.id = STYLE_ID;
    st.textContent = STYLE;
    doc.head.appendChild(st);
  }

  const root = mk('section', 'pcg-rules', 'root');
  const slot = mk('div', 'pcg-rules__slot', 'slot');
  slot.setAttribute('aria-hidden', 'true');
  const title = mk('h1', 'pcg-rules__title', 'title');
  const body = mk('p', 'pcg-rules__body', 'body');
  const note = mk('p', 'pcg-rules__note', 'note');
  const dots = mk('div', 'pcg-rules__dots', 'dots');
  const hint = mk('p', 'pcg-rules__hint', 'hint');
  hint.textContent = opts.hint ?? RULES_HINT;
  for (const el of [title, body, note]) el.setAttribute('aria-live', 'polite');
  root.append(slot, title, body, note, dots, hint);

  let nextBtn: HTMLButtonElement | null = null;
  if (opts.buttons) {
    const row = mk('div', 'pcg-rules__buttons', 'buttons');
    nextBtn = mk('button', '', 'button');
    nextBtn.type = 'button';
    nextBtn.dataset.action = 'next';
    const skipBtn = mk('button', '', 'button');
    skipBtn.type = 'button';
    skipBtn.dataset.action = 'skip';
    skipBtn.textContent = RULES_SKIP_LABEL;
    nextBtn.addEventListener('click', () => opts.onAction('next'));
    skipBtn.addEventListener('click', () => opts.onAction('skip'));
    row.append(nextBtn, skipBtn);
    root.append(row);
  }

  const reduced = (): boolean => opts.reducedMotion ?? env.prefersReducedMotion();

  let current = -1;
  let handle: RulesIllustrationHandle | null = null;
  let destroyed = false;

  const killHandle = (): void => {
    const h = handle;
    handle = null;
    try {
      h?.destroy();
    } catch (e) {
      console.error('rules illustration destroy failed', e);
    }
  };

  // Keys (default on).
  const keyTarget: KeyTarget | null =
    opts.keys === false ? null : typeof opts.keys === 'object' ? opts.keys : doc;
  const onKey = (e: Event): void => {
    const k = e as KeyboardEvent;
    if (k.repeat || k.ctrlKey || k.metaKey || k.altKey || k.shiftKey) return;
    const t = k.target as Element | null;
    if (t && typeof t.closest === 'function' && t.closest(EDITABLE)) return;
    let action: RulesAction | null = null;
    if (k.key === 'Enter' || k.key === 'ArrowRight' || k.key === ' ') action = 'next';
    else if (k.key === 'Escape') action = 'skip';
    if (!action) return;
    k.preventDefault();
    opts.onAction(action);
  };
  keyTarget?.addEventListener('keydown', onKey);

  // Gamepad (default on): edge-triggered, polled only while the shell exists.
  let raf: number | null = null;
  const down = new Set<number>();
  const poll = (): void => {
    raf = null;
    if (destroyed) return;
    const pressed = new Set<number>();
    for (const pad of env.getGamepads()) {
      if (!pad) continue;
      for (const b of [0, 1, 9]) if (pad.buttons[b]?.pressed) pressed.add(b);
    }
    const fresh = (b: number): boolean => pressed.has(b) && !down.has(b);
    const action: RulesAction | null = fresh(0) || fresh(9) ? 'next' : fresh(1) ? 'skip' : null;
    down.clear();
    for (const b of pressed) down.add(b);
    if (action) opts.onAction(action);
    if (!destroyed) raf = env.requestAnimationFrame(poll);
  };
  if (opts.gamepad !== false && (opts.env?.getGamepads !== undefined || hasNavPads())) {
    raf = env.requestAnimationFrame(poll);
  }

  return {
    element: root,
    slot,
    get card() {
      return current;
    },
    show(view, ctx) {
      if (destroyed) return;
      const idx = clampRulesCard(view.card, opts.cards.length);
      const card: RulesCard | undefined = opts.cards[idx];
      if (!card) return;
      const r = resolveRulesCard(card, ctx);
      title.textContent = r.title;
      body.textContent = r.body;
      note.textContent = r.note ?? '';
      note.hidden = r.note === null;
      root.dataset.card = String(idx);

      const n = Math.max(1, view.cards);
      while (dots.children.length > n) dots.lastElementChild?.remove();
      while (dots.children.length < n) dots.append(mk('span', 'pcg-rules__dot', 'dot'));
      const onClasses = ['is-on', ...(cls.dotOn ?? '').split(/\s+/).filter(Boolean)];
      Array.from(dots.children).forEach((d, i) => {
        for (const c of onClasses) d.classList.toggle(c, i === idx);
      });
      if (nextBtn) nextBtn.textContent = rulesNextLabel({ card: idx, cards: n });

      if (idx !== current) {
        current = idx;
        killHandle();
        try {
          handle = card.illustration.mount(slot, { reducedMotion: reduced() });
        } catch (e) {
          console.error('rules illustration mount failed', e);
        }
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      killHandle();
      keyTarget?.removeEventListener('keydown', onKey);
      if (raf !== null) env.cancelAnimationFrame(raf);
      raf = null;
      root.remove();
    },
  };
}
