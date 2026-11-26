// `?ui=<screen>` TV UI preview (SPEC §12.7): one `TvView` screen with fixture data, no relay or match.
// Screens: title, lobby, rules, roundStart, play, handsUp, reveal, transition, podium. `&step=N` picks
// the reveal / podium step or the rules card; ← / → step through them (rules: Next / Skip) so the
// couch controls can be tried. Frozen at TF0 (BUILD_PLAN §3): the `mount(root, screen)` signature.
import { fixtureView, isUiScreen, UI_SCREENS, type UiScreen } from './fixtures';
import { createTvUi } from './tvUi';

/** The step a screen opens on without `&step=`: a mid-reveal, a finished podium. */
const DEFAULT_STEP: Partial<Record<UiScreen, number>> = { reveal: 2, podium: 3 };

const MAX_STEP: Record<UiScreen, number> = {
  title: 0,
  lobby: 0,
  rules: 6,
  roundStart: 0,
  play: 0,
  handsUp: 0,
  reveal: 3,
  transition: 0,
  podium: 3,
};

export function mount(root: HTMLElement, screen: string): void {
  root.dataset.mode = 'ui';
  root.dataset.ui = screen;
  if (!isUiScreen(screen)) {
    const p = document.createElement('p');
    p.className = 'body';
    p.dataset.role = 'ui-unknown';
    p.textContent = `Unknown ?ui= screen "${screen}". Try: ${UI_SCREENS.join(', ')}.`;
    root.append(p);
    return;
  }
  const param = new URLSearchParams(location.search).get('step');
  const raw = param === null ? Number.NaN : Number(param);
  const start = Number.isFinite(raw) ? raw : (DEFAULT_STEP[screen] ?? 0);
  let step = Math.min(Math.max(Math.trunc(start), 0), MAX_STEP[screen]);

  const ui = createTvUi(root);
  const draw = (): void => ui.render(fixtureView(screen, step));
  const go = (to: number): void => {
    step = Math.min(Math.max(to, 0), MAX_STEP[screen]);
    draw();
  };
  ui.onControl((c) => {
    if (screen === 'rules') go(c === 'next' ? step + 1 : c === 'skip' ? 0 : step);
  });
  document.addEventListener('keydown', (e) => {
    if (screen === 'rules') return;
    if (e.key === 'ArrowRight') go(step + 1);
    else if (e.key === 'ArrowLeft') go(step - 1);
  });
  draw();
}
