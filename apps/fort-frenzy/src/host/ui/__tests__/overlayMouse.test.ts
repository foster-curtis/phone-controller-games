// @vitest-environment jsdom
// Mouse on the TV home screen (SPEC §11.1): a click on a row's real element does what Enter does, and
// hover moves focus. The overlay root ignores the pointer, so only the rows take it.
import { afterEach, describe, expect, it } from 'vitest';
import { createTvOverlay, type TvOverlay } from '../overlay';
import type { HomeIntent } from '../homeNav';
import { sampleView } from '../samples';

let ov: TvOverlay | null = null;
afterEach(() => {
  ov?.destroy();
  ov = null;
});

function setup(focus = 0) {
  const got: HomeIntent[] = [];
  ov = createTvOverlay(document.body, { onHome: (i) => got.push(i) });
  const view = sampleView('home');
  view.home = {
    rows: [
      { id: 'create' },
      { id: 'difficulty', difficulty: 'normal' },
      { id: 'resume', wave: 7, savedAgoMs: 1000 },
      { id: 'newRun' },
    ],
    focus,
    loading: 1,
  };
  ov.update(view);
  const rowEl = (i: number) => ov!.root.querySelector<HTMLElement>(`[data-row="${i}"] .pnl`)!;
  return { got, rowEl };
}

describe('home mouse', () => {
  it('click on Create room activates it, as Enter does', () => {
    const { got, rowEl } = setup(0);
    rowEl(0).click();
    expect(got).toEqual([{ type: 'activate', row: 'create' }]);
  });
  it('click on another row focuses it, then activates', () => {
    const { got, rowEl } = setup(0);
    rowEl(2).click();
    expect(got).toEqual([
      { type: 'focus', index: 2 },
      { type: 'activate', row: 'resume' },
    ]);
    got.length = 0;
    rowEl(3).click();
    expect(got).toEqual([
      { type: 'focus', index: 3 },
      { type: 'activate', row: 'newRun' },
    ]);
  });
  it('difficulty: the row cycles forward, the arrows pick a direction', () => {
    const { got, rowEl } = setup(1);
    rowEl(1).querySelector<HTMLElement>('.val')!.click();
    rowEl(1).querySelector<HTMLElement>('.arr.l')!.click();
    expect(got).toEqual([
      { type: 'cycle', row: 'difficulty', dir: 1 },
      { type: 'cycle', row: 'difficulty', dir: -1 },
    ]);
  });
  it('hover moves focus once; a hovered focused row is quiet', () => {
    const { got, rowEl } = setup(0);
    rowEl(3).dispatchEvent(new Event('pointerover', { bubbles: true }));
    rowEl(0).dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(got).toEqual([{ type: 'focus', index: 3 }]);
  });
});
