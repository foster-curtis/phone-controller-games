// @vitest-environment jsdom
// TV polish (BUILD_PLAN SC9; SPEC §6.6, decision #22): review player column, animate-only-what-is-new,
// the flash, the podium with ties, rules illustrations, reduced motion.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { noopSfx } from '../../../shared/sfx';
import { FIXTURE_PLAYERS, galleryViews } from '../../gallery';
import type { TvView } from '../../match/types';
import { renderTv } from '..';

const controls = { emit() {}, sfx: noopSfx, origin: 'https://example.test' };
const [a, b, c] = [FIXTURE_PLAYERS[0]!, FIXTURE_PLAYERS[1]!, FIXTURE_PLAYERS[2]!];

type Review = Extract<TvView, { phase: 'review' }>;
const review = (over: Partial<Review> = {}): Review => ({
  phase: 'review',
  photographer: a,
  photo: { index: 0, aspect: 4 / 3, url: 'blob:1' },
  photoIndex: 0,
  photoCount: 3,
  tags: [],
  caught: [],
  roster: [
    { ...b, count: 2 },
    { ...c, count: 0 },
  ],
  canSkipReview: false,
  ...over,
});

describe('review player column', () => {
  it('lists every dodger with their count, marking who is in this photo', () => {
    const root = document.createElement('div');
    renderTv(
      root,
      review({
        tags: [{ tagId: 't', photo: 0, x: 0.5, y: 0.5, playerId: b.playerId, player: b }],
      }),
      controls,
    );
    const rows = [...root.querySelectorAll<HTMLElement>('.players-col .row')];
    expect(rows.map((r) => r.querySelector('.who')!.textContent)).toEqual(['Ben', 'Cleo']);
    expect(rows.map((r) => r.querySelector('.n')!.textContent)).toEqual(['×2', '×0']);
    expect(rows[0]!.dataset.here).toBe('true');
    expect(rows[1]!.dataset.here).toBeUndefined();
    expect(root.querySelector('.photo-box .tag-name')).toBeNull();
  });

  it('falls back to the caught list when the view has no roster', () => {
    const root = document.createElement('div');
    renderTv(root, review({ roster: undefined, caught: [{ ...b, count: 1 }] }), controls);
    expect(root.querySelectorAll('.players-col .row')).toHaveLength(1);
  });

  it('develops a print and pops tags only when they are new', () => {
    const root = document.createElement('div');
    const tag = { tagId: 't', photo: 0, x: 0.5, y: 0.5, playerId: b.playerId, player: b };
    renderTv(root, review(), controls);
    expect(root.querySelector('img.photo.developing')).not.toBeNull();
    renderTv(root, review({ tags: [tag] }), controls);
    expect(root.querySelector('img.photo.developing')).toBeNull();
    expect(root.querySelector('.tag.new')).not.toBeNull();
    renderTv(root, review({ tags: [tag] }), controls);
    expect(root.querySelector('.tag.new')).toBeNull();
    renderTv(root, review({ photoIndex: 1, tags: [tag] }), controls);
    expect(root.querySelector('img.photo.developing')).not.toBeNull();
  });
});

describe('transitions', () => {
  it('fades a view in only on a new phase', () => {
    const root = document.createElement('div');
    renderTv(root, { phase: 'pass', photographer: a }, controls);
    expect(root.querySelector('.view.enter')).not.toBeNull();
    renderTv(root, { phase: 'pass', photographer: a }, controls);
    expect(root.querySelector('.view.enter')).toBeNull();
  });

  it('pops the shot counter with the flash', () => {
    const root = document.createElement('div');
    const shoot = (shots: number): TvView => ({
      phase: 'shoot',
      photographer: a,
      endsInMs: 9000,
      shots,
      maxShots: 15,
    });
    renderTv(root, shoot(1), controls);
    expect(root.querySelector('.shots.pop')).not.toBeNull();
    renderTv(root, shoot(1), controls);
    expect(root.querySelector('.shots.pop')).toBeNull();
  });
});

describe('match end', () => {
  it('puts tied winners side by side on the first step', () => {
    const view = galleryViews().find((v) => v.phase === 'matchEnd')!;
    const root = document.createElement('div');
    renderTv(root, view, controls);
    const first = root.querySelector('.podium .step[data-place="1"]')!;
    expect([...first.querySelectorAll('.chip')].map((x) => x.textContent)).toEqual(['Ben', 'Eli']);
    expect(root.querySelectorAll('.winners .chip')).toHaveLength(2);
    expect(root.textContent).toContain('Hardest to photograph');
  });

  it('shows a single winner alone and caps the podium at three places', () => {
    const root = document.createElement('div');
    const mk = (p: typeof a, score: number) => ({ ...p, score, connected: true, left: false });
    renderTv(
      root,
      {
        phase: 'matchEnd',
        winners: [a.playerId],
        standings: [mk(a, 0), mk(b, 1), mk(c, 2), mk(FIXTURE_PLAYERS[3]!, 3)],
      },
      controls,
    );
    expect(root.querySelectorAll('.podium .step')).toHaveLength(3);
    expect(root.querySelectorAll('.winners .chip')).toHaveLength(1);
  });
});

describe('rules illustrations', () => {
  it('draws a different aria-hidden SVG for each of the five cards', () => {
    const svgs = new Set<string>();
    for (let card = 0; card < 5; card++) {
      const root = document.createElement('div');
      renderTv(root, { phase: 'rules', card, cards: 5 }, controls);
      const art = root.querySelector('.rule-art')!;
      expect(art.getAttribute('aria-hidden')).toBe('true');
      svgs.add(art.innerHTML);
    }
    expect(svgs.size).toBe(5);
  });
});

describe('tv.css', () => {
  const css = readFileSync(resolve(import.meta.dirname, '../../../styles/tv.css'), 'utf8');
  it('uses tokens only (no hex literals)', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
  it('turns the animations off under prefers-reduced-motion', () => {
    const block = css.slice(css.indexOf('prefers-reduced-motion'));
    for (const sel of ['.shoot .flash.on', '.view.enter', '.smear', '.tag.new']) {
      expect(block).toContain(sel);
    }
  });
});
