// TV review (SPEC §6.4, §6.6, decision #22): the photo as an instant print, as large as fits beside the
// player column; tag circles (player color, no name label) at normalized x/y relative to the photo; a
// column listing every dodger with their tag count this round, live.
import type { Caught } from '../../shared/messages';
import type { TvView } from '../match/types';
import { h, paint } from './dom';

type Review = Extract<TvView, { phase: 'review' }>;

/** What changed since the last paint, so only new things animate (the TV repaints on every tag). */
export interface ReviewFx {
  /** A different photo than last paint: the print develops. */
  fresh: boolean;
  /** Tag ids not drawn last paint: they pop in. */
  newTags: ReadonlySet<string>;
}

const NO_FX: ReviewFx = { fresh: false, newTags: new Set() };

/** The players column: name in their color, a color chip, tags this round (highlight = in this photo). */
export function playerColumn(v: Review): HTMLElement {
  const col = h('aside', 'players-col caught');
  col.setAttribute('aria-label', 'Tags this round');
  col.append(
    h('p', 'marker-tv', `Photo ${v.photoIndex + 1} / ${v.photoCount} · ${v.photographer.name}`),
  );
  const rows: Caught[] = v.roster ?? v.caught.filter((c) => c.playerId !== v.photographer.playerId);
  const here = new Set(v.tags.map((t) => t.player?.playerId));
  const list = h('ul', 'roster-col');
  for (const p of rows) {
    const li = h('li', p.count > 0 ? 'row has' : 'row');
    li.dataset.player = p.playerId;
    if (here.has(p.playerId)) li.dataset.here = 'true';
    paint(li, p);
    const swatch = h('span', 'swatch');
    swatch.setAttribute('aria-hidden', 'true');
    li.append(swatch, h('span', 'who', p.name), h('span', 'n score', `×${p.count}`));
    list.append(li);
  }
  col.append(list);
  return col;
}

export function renderReview(v: Review, fx: ReviewFx = NO_FX): HTMLElement {
  const el = h('section', 'view review');

  const stage = h('div', 'stage');
  const aspect = v.photo && v.photo.aspect > 0 ? v.photo.aspect : 4 / 3;
  const box = h('div', 'photo-box');
  box.style.setProperty('--aspect', String(aspect));
  // `--tag-size` (brand.css) is a share of the photo's short side; tags size in % of the box width.
  box.style.setProperty('--short-frac', String(Math.min(1, 1 / aspect)));
  if (v.photo?.url) {
    const img = h('img', fx.fresh ? 'photo developing' : 'photo');
    img.src = v.photo.url;
    img.alt = `Photo ${v.photoIndex + 1}`;
    box.append(img);
  } else {
    box.append(h('div', 'photo empty', v.photoCount === 0 ? 'No photos' : 'Developing…'));
  }
  for (const t of v.tags) {
    // A circle only, never a pink one: the ring is the player's color (or grey for Unknown).
    const tag = h('div', t.player ? 'tag' : 'tag unknown');
    if (fx.newTags.has(t.tagId)) tag.classList.add('new');
    tag.dataset.tag = t.tagId;
    tag.style.left = `${t.x * 100}%`;
    tag.style.top = `${t.y * 100}%`;
    if (t.player) {
      paint(tag, t.player);
      // The name is for assistive tech and tests only, visually hidden (C3: no label on the photo).
      tag.append(h('span', 'sr', t.player.name));
    } else {
      tag.append(h('span', 'q', '?'));
    }
    box.append(tag);
  }
  box.append(h('span', 'print-note', `by ${v.photographer.name}`));
  // The box sizes from container units of `.fit`, an absolutely positioned layer: its height is
  // always definite, unlike a flex-grown stage's, where `100cqh` resolved to 0 (BUILD_PLAN §8).
  const fit = h('div', 'fit');
  fit.append(box);
  stage.append(fit);
  el.append(stage, playerColumn(v));
  return el;
}
