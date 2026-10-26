import { beforeEach, describe, expect, it } from 'vitest';
import { fitAboveKeyboard, resetKeyboardBaseline, type ViewportLike } from '../keyboard';

class FakeViewport implements ViewportLike {
  width = 568;
  height = 320;
  offsetTop = 0;
  private cbs = new Set<() => void>();
  addEventListener(_t: 'resize' | 'scroll', cb: () => void) {
    this.cbs.add(cb);
  }
  removeEventListener(_t: 'resize' | 'scroll', cb: () => void) {
    this.cbs.delete(cb);
  }
  set(h: number, top = 0, w = this.width) {
    this.height = h;
    this.offsetTop = top;
    this.width = w;
    for (const cb of [...this.cbs]) cb();
  }
}

beforeEach(() => resetKeyboardBaseline());

describe('fitAboveKeyboard', () => {
  it('pins the container to the visible area while the keyboard is up', () => {
    const vv = new FakeViewport();
    const box = document.createElement('div');
    const stop = fitAboveKeyboard(box, vv);
    expect(box.classList.contains('kb-open')).toBe(false);
    vv.set(140, 30);
    expect(box.classList.contains('kb-open')).toBe(true);
    expect(box.style.getPropertyValue('--vv-top')).toBe('30px');
    expect(box.style.getPropertyValue('--vv-h')).toBe('140px');
    vv.set(320);
    expect(box.classList.contains('kb-open')).toBe(false);
    expect(box.style.getPropertyValue('--vv-h')).toBe('');
    vv.set(140);
    stop();
    expect(box.classList.contains('kb-open')).toBe(false);
    vv.set(100); // no longer listening
    expect(box.classList.contains('kb-open')).toBe(false);
  });

  it('ignores small height changes and rotation (new width = new baseline)', () => {
    const vv = new FakeViewport();
    const box = document.createElement('div');
    fitAboveKeyboard(box, vv);
    vv.set(290); // browser toolbar, not a keyboard
    expect(box.classList.contains('kb-open')).toBe(false);
    vv.set(568, 0, 320); // rotated to portrait
    expect(box.classList.contains('kb-open')).toBe(false);
  });

  it('is a no-op without visualViewport', () => {
    const box = document.createElement('div');
    fitAboveKeyboard(box, null)();
    expect(box.classList.contains('kb-open')).toBe(false);
  });
});
