// TV round views: announce, scatter, shoot, upload (SPEC §6.2, §6.6). The shoot view never shows
// photos (it would tell dodgers where the camera points); it has a white flash per shot (CSS decay) and
// the shot counter pops. Upload shows a print developing (SC9).
import type { TvView } from '../match/types';
import { chip, h, seconds } from './dom';

type Of<P extends TvView['phase']> = Extract<TvView, { phase: P }>;

export function renderAnnounce(v: Of<'announce'>): HTMLElement {
  const el = h('section', 'view announce');
  el.append(
    h('p', 'caption', `Round ${v.turn} of ${v.turns}`),
    h('p', 'marker-tv', '📸'),
    chip(v.photographer, 'chip huge'),
    h('p', 'banner', 'is the photographer!'),
  );
  return el;
}

export function renderScatter(v: Of<'scatter'>): HTMLElement {
  const el = h('section', 'view scatter');
  el.append(
    h('p', 'banner', 'Scatter!'),
    h('div', 'countdown title', String(seconds(v.endsInMs))),
    h('p', 'h2', `${v.photographer.name}: eyes closed`),
  );
  return el;
}

/** `flash` = this render follows a new shot: the flash decays by CSS and the counter pops. */
export function renderShoot(v: Of<'shoot'>, flash: boolean): HTMLElement {
  const el = h('section', 'view shoot');
  const f = h('div', flash ? 'flash on' : 'flash');
  f.setAttribute('aria-hidden', 'true');
  el.append(
    f,
    h('div', 'countdown title', String(seconds(v.endsInMs))),
    h('p', flash ? 'banner shots pop' : 'banner shots', `📸 ${v.shots} / ${v.maxShots}`),
    h('p', 'h2', v.photographer.name),
  );
  return el;
}

export function renderUpload(v: Of<'upload'>): HTMLElement {
  const el = h('section', 'view upload');
  // An instant print whose window is still dark and warm; it fills as photos arrive.
  const print = h('div', 'print up-print');
  const win = h('div', 'print-image');
  const fill = h('div', 'smear developing');
  fill.style.setProperty(
    '--done',
    String(v.expected > 0 ? Math.min(1, v.received / v.expected) : 0),
  );
  win.append(fill);
  print.append(win, h('span', 'print-caption marker-tv', `by ${v.photographer.name}`));
  el.append(
    print,
    h('p', 'banner', 'Developing photos…'),
    h('p', 'title count', `${v.received} / ${v.expected}`),
  );
  return el;
}
