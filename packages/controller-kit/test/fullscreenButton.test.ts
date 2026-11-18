import { afterEach, describe, expect, it, vi } from 'vitest';
import { FULLSCREEN_TEXT, createFullscreenButton } from '../src/widgets/fullscreenButton';
import { tryLockLandscape } from '../src/platform/orientation';
import { pointer } from './helpers';

interface Env {
  doc: Document;
  win: Window;
  lock: ReturnType<typeof vi.fn>;
  mql: { matches: boolean; fire(): void };
  fireFs(): void;
  isActive(): boolean;
}

/** jsdom document with a configurable Fullscreen API: none, standard or webkit only. */
function setup(
  o: {
    api?: 'none' | 'standard' | 'webkit';
    refuse?: boolean;
    standalone?: boolean;
    iosNav?: boolean;
  } = {},
): Env {
  const doc = document;
  const root = doc.documentElement as unknown as Record<string, unknown>;
  const d = doc as unknown as Record<string, unknown>;
  let active: Element | null = null;
  const enter = () => {
    if (o.refuse) return Promise.reject(new Error('denied'));
    active = doc.documentElement;
    return Promise.resolve();
  };
  delete root.requestFullscreen;
  delete root.webkitRequestFullscreen;
  Object.defineProperty(doc, 'fullscreenElement', { configurable: true, get: () => null });
  Object.defineProperty(doc, 'webkitFullscreenElement', { configurable: true, get: () => active });
  if (o.api === 'standard') {
    root.requestFullscreen = enter;
    Object.defineProperty(doc, 'fullscreenElement', { configurable: true, get: () => active });
  }
  if (o.api === 'webkit') root.webkitRequestFullscreen = enter;
  d.exitFullscreen = () => {
    active = null;
    return Promise.resolve();
  };
  const listeners: Array<() => void> = [];
  const mql = {
    matches: o.standalone === true,
    addEventListener: (_t: string, cb: () => void) => listeners.push(cb),
    removeEventListener: () => {},
    fire: () => listeners.forEach((cb) => cb()),
  };
  const lock = vi.fn(() => Promise.resolve());
  const win = {
    matchMedia: () => mql,
    navigator: o.iosNav ? { standalone: false } : {},
    screen: { orientation: { lock } },
    isSecureContext: true,
  } as unknown as Window;
  return {
    doc,
    win,
    lock,
    mql: mql as Env['mql'],
    fireFs: () => doc.dispatchEvent(new Event('fullscreenchange')),
    isActive: () => active !== null,
  };
}

const tap = (b: HTMLElement) => {
  pointer(b, 'pointerdown', 1);
  pointer(b, 'pointerup', 1);
  b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
};
const flush = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => document.body.replaceChildren());

describe('createFullscreenButton', () => {
  it('toggle mode: a tap enters full screen and locks landscape', async () => {
    const e = setup({ api: 'standard' });
    const b = createFullscreenButton({
      variant: 'corner',
      landscape: true,
      document: e.doc,
      window: e.win,
    });
    document.body.append(b.element);
    expect(b.mode).toBe('toggle');
    tap(b.element);
    await flush();
    expect(e.lock).toHaveBeenCalledWith('landscape');
    e.fireFs();
    expect(b.mode).toBe('hidden');
    expect(b.element.hidden).toBe(true);
    b.destroy();
  });

  it('works with the webkit API only', async () => {
    const e = setup({ api: 'webkit' });
    const b = createFullscreenButton({ variant: 'inline', document: e.doc, window: e.win });
    expect(b.mode).toBe('toggle');
    tap(b.element);
    await flush();
    e.doc.dispatchEvent(new Event('webkitfullscreenchange'));
    expect(b.mode).toBe('hidden');
    b.destroy();
  });

  it('shows again when full screen ends', async () => {
    const e = setup({ api: 'standard' });
    const b = createFullscreenButton({ variant: 'inline', document: e.doc, window: e.win });
    tap(b.element);
    await flush();
    e.fireFs();
    expect(b.mode).toBe('hidden');
    await (e.doc as unknown as { exitFullscreen(): Promise<void> }).exitFullscreen();
    e.fireFs();
    expect(b.mode).toBe('toggle');
    expect(b.element.hidden).toBe(false);
    b.destroy();
  });

  it('falls back to the install sheet when the API is absent (share body on iOS)', () => {
    const e = setup({ api: 'none', iosNav: true });
    const b = createFullscreenButton({ variant: 'inline', document: e.doc, window: e.win });
    expect(b.mode).toBe('install-sheet');
    tap(b.element);
    expect(document.querySelector('.pcg-sheet p')!.textContent).toBe(
      FULLSCREEN_TEXT.sheetBodyShare,
    );
    b.destroy();
  });

  it('uses the menu body where navigator.standalone does not exist', () => {
    const e = setup({ api: 'none' });
    const b = createFullscreenButton({ variant: 'inline', document: e.doc, window: e.win });
    tap(b.element);
    expect(document.querySelector('.pcg-sheet p')!.textContent).toBe(FULLSCREEN_TEXT.sheetBodyMenu);
    b.destroy();
  });

  it('a refused request shows a toast and does not throw', async () => {
    const e = setup({ api: 'standard', refuse: true });
    const b = createFullscreenButton({
      variant: 'inline',
      landscape: true,
      document: e.doc,
      window: e.win,
    });
    tap(b.element);
    await flush();
    expect(document.querySelector('.pcg-toast')!.textContent).toBe(FULLSCREEN_TEXT.failed);
    expect(e.lock).not.toHaveBeenCalled();
    expect(b.mode).toBe('toggle');
    b.destroy();
  });

  it('is hidden when installed, and re-evaluates on display-mode change', () => {
    const e = setup({ api: 'standard', standalone: true });
    const b = createFullscreenButton({ variant: 'inline', document: e.doc, window: e.win });
    expect(b.mode).toBe('hidden');
    e.mql.matches = false;
    e.mql.fire();
    expect(b.mode).toBe('toggle');
    b.destroy();
  });

  it('ignores a press that began elsewhere (thumb sliding in from the joystick)', async () => {
    const e = setup({ api: 'standard' });
    const b = createFullscreenButton({ variant: 'corner', document: e.doc, window: e.win });
    document.body.append(b.element);
    pointer(document.body, 'pointerdown', 1);
    pointer(b.element, 'pointerup', 1);
    b.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await flush();
    expect(e.isActive()).toBe(false);
    expect(b.mode).toBe('toggle');
    b.destroy();
  });

  it('keyboard activation works', async () => {
    const e = setup({ api: 'standard' });
    const b = createFullscreenButton({ variant: 'inline', document: e.doc, window: e.win });
    b.element.click(); // a keyboard Enter/Space click has detail 0
    await flush();
    expect(e.isActive()).toBe(true);
    b.destroy();
  });

  it('corner variant is >= 44px, positioned, labelled, with an svg', () => {
    const e = setup({ api: 'standard' });
    const b = createFullscreenButton({
      variant: 'corner',
      corner: 'bottom-left',
      document: e.doc,
      window: e.win,
    });
    const s = b.element.style;
    expect(s.minWidth).toBe('44px');
    expect(s.minHeight).toBe('44px');
    expect(s.position).toBe('fixed');
    expect(b.element.getAttribute('aria-label')).toBe(FULLSCREEN_TEXT.enter);
    expect(b.element.querySelector('svg')).not.toBeNull();
    b.destroy();
  });

  it('inline variant is a labelled button', () => {
    const e = setup({ api: 'standard' });
    const b = createFullscreenButton({
      variant: 'inline',
      text: { enter: 'Go big' },
      document: e.doc,
      window: e.win,
    });
    expect(b.element.textContent).toBe('Go big');
    b.destroy();
  });
});

describe('tryLockLandscape', () => {
  it('does not request full screen and locks only when already full screen', async () => {
    const e = setup({ api: 'standard' });
    expect(await tryLockLandscape(e.win, e.doc)).toBe(false);
    expect(e.isActive()).toBe(false);
    await e.doc.documentElement.requestFullscreen();
    expect(await tryLockLandscape(e.win, e.doc)).toBe(true);
    expect(e.lock).toHaveBeenCalledWith('landscape');
  });
});
