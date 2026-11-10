// TV view dispatcher (SPEC §6.6): `renderTv(root, view, controls)` renders one `TvView` into `root`,
// one module per phase, plus the host's control buttons. Stateless apart from a few `data-*` marks on the
// root (shot count, last view, last photo and tags) that decide what animates (SPEC §6.6, SC9).
import { controlsFor } from '../controls';
import type { TvView } from '../match/types';
import { h, type TvControls } from './dom';
import { renderLobby } from './lobby';
import { renderMatchEnd, renderResults } from './results';
import { renderReview, type ReviewFx } from './review';
import { renderPass } from './pass';
import { renderAnnounce, renderScatter, renderShoot, renderUpload } from './rounds';
import { renderRules } from './rules';

export type { TvControls } from './dom';

/** The TV repaints on every change, so animations run only for what is new since the last paint. */
function reviewFx(root: HTMLElement, view: TvView): ReviewFx {
  if (view.phase !== 'review') {
    delete root.dataset.photoKey;
    delete root.dataset.tagIds;
    return { fresh: false, newTags: new Set() };
  }
  const key = `${view.photographer.playerId}:${view.photoIndex}`;
  const fresh = root.dataset.photoKey !== key;
  const before = new Set(fresh ? [] : (root.dataset.tagIds ?? '').split(',').filter(Boolean));
  const ids = view.tags.map((t) => t.tagId);
  root.dataset.photoKey = key;
  root.dataset.tagIds = ids.join(',');
  return { fresh, newTags: new Set(ids.filter((id) => !before.has(id))) };
}

function screenFor(view: TvView, c: TvControls, flash: boolean, fx: ReviewFx): HTMLElement {
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
      return renderReview(view, fx);
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
  const fx = reviewFx(root, view);
  const screen = screenFor(view, controls, flash, fx);
  screen.dataset.tv = view.phase;
  // A new phase (or rules card) fades its view in; repaints of the same view stay still.
  const key = view.phase === 'rules' ? `rules${view.card}` : view.phase;
  if (root.dataset.view !== key) screen.classList.add('enter');
  root.dataset.view = key;

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
}
