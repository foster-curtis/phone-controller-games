// @vitest-environment jsdom
// TV views and host controls (BUILD_PLAN SC4 acceptance; SPEC §6.4, §6.5, §6.6).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { noopSfx } from '../../../shared/sfx';
import { controlForKey, installHostKeys } from '../../controls';
import { FIXTURE_PLAYERS, galleryViews } from '../../gallery';
import type { HostControl, TvView } from '../../match/types';
import { renderTv } from '..';

const controls = (emit: (c: HostControl) => void = () => {}) => ({
  emit,
  sfx: noopSfx,
  origin: 'https://example.test',
});
const render = (view: TvView, emit?: (c: HostControl) => void) => {
  const root = document.createElement('div');
  document.body.append(root);
  renderTv(root, view, controls(emit));
  return root;
};
const players = FIXTURE_PLAYERS;
const [a, b, c] = [players[0]!, players[1]!, players[2]!];

describe('renderTv', () => {
  it('renders [data-tv=<phase>] for every fixture phase', () => {
    const seen = new Set<string>();
    for (const v of galleryViews()) {
      const root = render(v);
      expect(root.querySelector(`[data-tv=${v.phase}]`)).not.toBeNull();
      seen.add(v.phase);
    }
    expect(seen.size).toBe(10);
  });

  it('places a tag at x=0.25, y=0.5 of the photo box', () => {
    const root = render({
      phase: 'review',
      photographer: a,
      photo: { index: 0, aspect: 3 / 4 },
      photoIndex: 0,
      photoCount: 1,
      tags: [{ tagId: 't', photo: 0, x: 0.25, y: 0.5, playerId: b.playerId, player: b }],
      caught: [],
      canSkipReview: false,
    });
    const box = root.querySelector('.photo-box')!;
    const tag = box.querySelector<HTMLElement>('.tag')!;
    expect(tag.parentElement).toBe(box);
    expect(tag.style.left).toBe('25%');
    expect(tag.style.top).toBe('50%');
    // C3: the circle only. The name is visually hidden text for assistive tech and e2e.
    expect(tag.querySelector('.tag-name')).toBeNull();
    expect(tag.querySelector('.sr')!.textContent).toBe('Ben');
  });

  // C2 (SC5-fix-2): a flex-grown stage as the size container gave `100cqh` = 0, so the photo box
  // and its <img> were 0×0 while the tags still showed. jsdom has no layout: check the structure.
  it('sizes the photo box in an absolute .fit layer, not on the flex-grown stage', () => {
    const root = render({
      phase: 'review',
      photographer: a,
      photo: { index: 0, aspect: 4 / 3, url: 'blob:1' },
      photoIndex: 0,
      photoCount: 1,
      tags: [],
      caught: [],
      canSkipReview: false,
    });
    const img = root.querySelector('.stage > .fit > .photo-box > img.photo');
    expect(img?.getAttribute('src')).toBe('blob:1');
    const tvCss = readFileSync(resolve(import.meta.dirname, '../../../styles/tv.css'), 'utf8');
    const rule = (sel: string) => tvCss.match(new RegExp(`${sel}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('\\.review \\.stage')).not.toContain('container-type');
    expect(rule('\\.review \\.stage > \\.fit')).toMatch(
      /position: absolute;[\s\S]*container-type: size/,
    );
  });

  it('draws Unknown tags as a grey "?"', () => {
    const root = render({
      phase: 'review',
      photographer: a,
      photo: null,
      photoIndex: 0,
      photoCount: 0,
      tags: [{ tagId: 't', photo: 0, x: 0.5, y: 0.5, playerId: null, player: null }],
      caught: [{ ...b, count: 2 }],
      canSkipReview: true,
    });
    expect(root.querySelector('.tag.unknown')!.textContent).toBe('?');
    expect(root.querySelector('.players-col')!.textContent).toContain('Ben×2');
    expect(root.querySelector('[data-action=skipReview]')).not.toBeNull();
  });

  it('sorts standings lowest first and marks ties', () => {
    const root = render({
      phase: 'matchEnd',
      winners: [b.playerId],
      standings: [
        { ...a, score: 3, connected: true, left: false },
        { ...b, score: 1, connected: true, left: false },
        { ...c, score: 3, connected: true, left: false },
      ],
    });
    const rows = [...root.querySelectorAll<HTMLElement>('.standings .standing')];
    expect(rows.map((r) => r.dataset.player)).toEqual([b.playerId, a.playerId, c.playerId]);
    expect(rows.map((r) => r.dataset.tie ?? 'no')).toEqual(['no', 'true', 'true']);
    expect(rows[1]!.querySelector('.rank')!.textContent).toBe('T2');
  });

  it('shoot view has no <img> and flashes only on a new shot', () => {
    const view = (shots: number): TvView => ({
      phase: 'shoot',
      photographer: a,
      endsInMs: 9_000,
      shots,
      maxShots: 15,
    });
    const root = document.createElement('div');
    renderTv(root, view(1), controls());
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('.flash.on')).not.toBeNull();
    expect(root.querySelector('.shots')?.textContent).toBe('1 / 15');
    expect(root.querySelector('.shots svg.ico')).not.toBeNull();
    renderTv(root, view(1), controls());
    expect(root.querySelector('.flash.on')).toBeNull();
  });

  it('renders a QR for the room code', () => {
    const root = render(galleryViews()[0]!);
    const qr = root.querySelector('svg.qr')!;
    expect(qr.querySelector('path')!.getAttribute('d')!.length).toBeGreaterThan(100);
    expect(root.textContent).toContain('KQXT');
    expect(root.textContent).toContain('no camera');
  });

  it('buttons emit controls; Sound on unlocks audio', () => {
    const emit = vi.fn();
    const unlock = vi.fn(() => Promise.resolve());
    const root = document.createElement('div');
    renderTv(root, galleryViews()[0]!, {
      emit,
      sfx: { ...noopSfx, unlock },
      origin: 'https://example.test',
    });
    root.querySelector<HTMLButtonElement>('button.sound')!.click();
    expect(unlock).toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('[data-action=start]')!.click();
    expect(emit).toHaveBeenCalledWith({ action: 'start' });
  });
});

describe('host keyboard', () => {
  const rules: TvView = { phase: 'rules', card: 1, cards: 5 };
  const matchEnd: TvView = { phase: 'matchEnd', standings: [], winners: [] };

  it('maps keys to leader actions per phase', () => {
    expect(controlForKey(rules, 'Enter')).toEqual({ action: 'next' });
    expect(controlForKey(rules, 'ArrowRight')).toEqual({ action: 'next' });
    expect(controlForKey(rules, 'Escape')).toEqual({ action: 'skip' });
    expect(controlForKey(rules, 'r')).toBeNull();
    expect(controlForKey(matchEnd, 'R')).toEqual({ action: 'rematch' });
    expect(controlForKey(matchEnd, 'l')).toEqual({ action: 'lobby' });
    expect(controlForKey({ phase: 'pass', photographer: a }, 'Enter')).toBeNull();
  });

  it('does not Start while the lobby cannot start', () => {
    const lobby = galleryViews()[0]! as Extract<TvView, { phase: 'lobby' }>;
    expect(controlForKey({ ...lobby, canStart: false }, 'Enter')).toBeNull();
    expect(controlForKey(lobby, 'Enter')).toEqual({ action: 'start' });
  });

  it('emits from a keydown on the target', () => {
    const emit = vi.fn();
    const off = installHostKeys(document, () => rules, emit);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(emit).toHaveBeenCalledWith({ action: 'skip' });
    off();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
