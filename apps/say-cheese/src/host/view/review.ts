// TV review (SPEC §6.4, §6.6): the photo as large as fits, tag circles at normalized x/y relative to the
// photo box (not the stage), a live "Caught this round" strip.
import type { TvView } from '../match/types';
import { chip, h, paint } from './dom';

type Review = Extract<TvView, { phase: 'review' }>;

export function renderReview(v: Review): HTMLElement {
  const el = h('section', 'view review');
  el.append(
    h('p', 'marker-tv', `Photo ${v.photoIndex + 1} / ${v.photoCount} · ${v.photographer.name}`),
  );

  const stage = h('div', 'stage');
  const aspect = v.photo && v.photo.aspect > 0 ? v.photo.aspect : 4 / 3;
  const box = h('div', 'photo-box');
  box.style.setProperty('--aspect', String(aspect));
  // `--tag-size` (brand.css) is a share of the photo's short side; tags size in % of the box width.
  box.style.setProperty('--short-frac', String(Math.min(1, 1 / aspect)));
  if (v.photo?.url) {
    const img = h('img', 'photo');
    img.src = v.photo.url;
    img.alt = `Photo ${v.photoIndex + 1}`;
    box.append(img);
  } else {
    box.append(h('div', 'photo empty', v.photoCount === 0 ? 'No photos' : 'Developing…'));
  }
  for (const t of v.tags) {
    const tag = h('div', t.player ? 'tag' : 'tag unknown');
    tag.dataset.tag = t.tagId;
    tag.style.left = `${t.x * 100}%`;
    tag.style.top = `${t.y * 100}%`;
    if (t.player) {
      paint(tag, t.player);
      tag.append(h('span', 'tag-name', t.player.name));
    } else {
      tag.append(h('span', 'q', '?'));
    }
    box.append(tag);
  }
  stage.append(box);
  el.append(stage);

  const strip = h('div', 'caught');
  strip.append(h('span', 'label', 'Caught this round'));
  const shown = v.caught.filter((c) => c.count > 0);
  for (const c of shown) {
    const item = chip(c, 'chip name');
    item.append(` ×${c.count}`);
    strip.append(item);
  }
  if (shown.length === 0) strip.append(h('span', 'caption', 'Nobody yet'));
  el.append(strip);
  return el;
}
