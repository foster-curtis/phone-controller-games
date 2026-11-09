// TV round views: announce, scatter, shoot, upload (SPEC §6.2, §6.6). The shoot view never shows
// photos (it would tell dodgers where the camera points); it has a white flash element toggled per shot.
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

/** `flash` = this render follows a new shot; the caller clears the `on` class shortly after. */
export function renderShoot(v: Of<'shoot'>, flash: boolean): HTMLElement {
  const el = h('section', 'view shoot');
  const f = h('div', flash ? 'flash on' : 'flash');
  f.setAttribute('aria-hidden', 'true');
  el.append(
    f,
    h('div', 'countdown title', String(seconds(v.endsInMs))),
    h('p', 'banner shots', `📸 ${v.shots} / ${v.maxShots}`),
    h('p', 'h2', v.photographer.name),
  );
  return el;
}

export function renderUpload(v: Of<'upload'>): HTMLElement {
  const el = h('section', 'view upload');
  el.append(
    h('p', 'banner', 'Developing photos…'),
    h('p', 'title count', `${v.received} / ${v.expected}`),
  );
  return el;
}
