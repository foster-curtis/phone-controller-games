// TV view dispatcher (SPEC §6.6): `renderTv(root, view, controls)` renders one `TvView` into `root`,
// one module per phase, plus the host's control buttons. Stateless apart from the shoot-flash counter.
import { controlsFor } from '../controls';
import type { TvView } from '../match/types';
import { h, type TvControls } from './dom';
import { renderLobby } from './lobby';
import { renderMatchEnd, renderResults } from './results';
import { renderReview } from './review';
import { renderAnnounce, renderPass, renderScatter, renderShoot, renderUpload } from './rounds';
import { renderRules } from './rules';

export type { TvControls } from './dom';

const FLASH_MS = 120;

function screenFor(view: TvView, c: TvControls, flash: boolean): HTMLElement {
  switch (view.phase) {
    case 'lobby':
      return renderLobby(view, c);
    case 'rules':
      return renderRules(view);
    case 'pass':
      return renderPass(view);
    case 'announce':
      return renderAnnounce(view);
    case 'scatter':
      return renderScatter(view);
    case 'shoot':
      return renderShoot(view, flash);
    case 'upload':
      return renderUpload(view);
    case 'review':
      return renderReview(view);
    case 'results':
      return renderResults(view);
    case 'matchEnd':
      return renderMatchEnd(view);
  }
}

export function renderTv(root: HTMLElement, view: TvView, controls: TvControls): void {
  const last = Number(root.dataset.shots ?? '0');
  const flash = view.phase === 'shoot' && view.shots > last;
  root.dataset.shots = view.phase === 'shoot' ? String(view.shots) : '0';
  root.dataset.tv = view.phase;
  const screen = screenFor(view, controls, flash);
  screen.dataset.tv = view.phase;

  const bar = h('nav', 'host-controls');
  bar.setAttribute('aria-label', 'Host controls');
  for (const spec of controlsFor(view)) {
    const b = h('button', spec.primary ? 'btn primary' : 'btn', spec.label);
    b.type = 'button';
    b.disabled = !!spec.disabled;
    b.dataset.action = spec.control.action;
    if (spec.key) b.append(h('kbd', 'key', spec.key));
    b.addEventListener('click', () => {
      void controls.sfx.unlock();
      controls.emit(spec.control);
    });
    bar.append(b);
  }
  root.replaceChildren(screen, bar);

  if (flash) {
    const f = screen.querySelector('.flash');
    setTimeout(() => f?.classList.remove('on'), FLASH_MS);
  }
}
