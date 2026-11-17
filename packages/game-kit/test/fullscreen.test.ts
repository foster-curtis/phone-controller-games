// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindFullscreenShortcut, createHostFullscreenButton } from '../src/fullscreen';

function setup(o: { api?: 'none' | 'standard' | 'webkit'; refuse?: boolean } = {}) {
  const doc = document;
  const root = doc.documentElement as unknown as Record<string, unknown>;
  const d = doc as unknown as Record<string, unknown>;
  let active: Element | null = null;
  const enter = vi.fn(() =>
    o.refuse
      ? Promise.reject(new Error('denied'))
      : ((active = doc.documentElement), Promise.resolve()),
  );
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
  return { doc, enter, fire: () => doc.dispatchEvent(new Event('fullscreenchange')) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const key = (init: KeyboardEventInit, target: EventTarget = document) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
afterEach(() => document.body.replaceChildren());

describe('createHostFullscreenButton', () => {
  it('is a real, visible button with enter/exit labels', async () => {
    const e = setup({ api: 'standard' });
    const b = createHostFullscreenButton({ parent: document.body, shortcut: false });
    expect(b.supported).toBe(true);
    expect(b.element.tagName).toBe('BUTTON');
    expect(b.element.hidden).toBe(false);
    expect(b.element.textContent).toBe('Full screen');
    b.element.click();
    await flush();
    expect(e.enter).toHaveBeenCalledOnce();
    e.fire();
    expect(b.element.textContent).toBe('Exit full screen');
    expect(await b.toggle()).toBe(false);
    e.fire();
    expect(b.element.textContent).toBe('Full screen');
    b.destroy();
  });

  it('works with the webkit API only', async () => {
    const e = setup({ api: 'webkit' });
    const b = createHostFullscreenButton({ parent: document.body, shortcut: false });
    expect(b.supported).toBe(true);
    expect(await b.toggle()).toBe(true);
    expect(e.enter).toHaveBeenCalled();
    b.destroy();
  });

  it('is hidden and inert where the API is missing', async () => {
    setup({ api: 'none' });
    const b = createHostFullscreenButton({ parent: document.body });
    expect(b.supported).toBe(false);
    expect(b.element.hidden).toBe(true);
    b.setVisible(true);
    expect(b.element.hidden).toBe(true);
    expect(await b.toggle()).toBe(false);
    b.destroy();
  });

  it('setVisible controls display', () => {
    setup({ api: 'standard' });
    const b = createHostFullscreenButton({ parent: document.body, shortcut: false });
    b.setVisible(false);
    expect(b.element.hidden).toBe(true);
    b.setVisible(true);
    expect(b.element.hidden).toBe(false);
    b.destroy();
  });

  it('a refusal goes to onError, or to a toast in parent, never throws', async () => {
    setup({ api: 'standard', refuse: true });
    const onError = vi.fn();
    const a = createHostFullscreenButton({ parent: document.body, shortcut: false, onError });
    a.element.click();
    await flush();
    expect(onError).toHaveBeenCalledOnce();
    a.destroy();
    const b = createHostFullscreenButton({ parent: document.body, shortcut: false });
    b.element.click();
    await flush();
    expect(document.querySelector('.pcg-toast')).not.toBeNull();
    b.destroy();
  });

  it('F toggles through the button helper and unsubscribes on destroy', async () => {
    const e = setup({ api: 'standard' });
    const b = createHostFullscreenButton({ parent: document.body });
    key({ key: 'f' });
    await flush();
    expect(e.enter).toHaveBeenCalledOnce();
    b.destroy();
    key({ key: 'F' });
    await flush();
    expect(e.enter).toHaveBeenCalledOnce();
  });
});

describe('bindFullscreenShortcut', () => {
  it('ignores modifiers, key repeat and text fields', async () => {
    const e = setup({ api: 'standard' });
    const off = bindFullscreenShortcut();
    key({ key: 'f', ctrlKey: true });
    key({ key: 'f', altKey: true });
    key({ key: 'f', metaKey: true });
    key({ key: 'f', repeat: true });
    key({ key: 'g' });
    const input = document.body.appendChild(document.createElement('input'));
    key({ key: 'f' }, input);
    const ta = document.body.appendChild(document.createElement('textarea'));
    key({ key: 'f' }, ta);
    const sel = document.body.appendChild(document.createElement('select'));
    key({ key: 'f' }, sel);
    const ce = document.body.appendChild(document.createElement('div'));
    ce.setAttribute('contenteditable', 'true');
    key({ key: 'f' }, ce);
    await flush();
    expect(e.enter).not.toHaveBeenCalled();
    key({ key: 'F' });
    await flush();
    expect(e.enter).toHaveBeenCalledOnce();
    off();
  });

  it('exits when already full screen, and reports a refusal', async () => {
    const e = setup({ api: 'standard' });
    const off = bindFullscreenShortcut();
    key({ key: 'f' });
    await flush();
    key({ key: 'f' });
    await flush();
    expect(document.documentElement).toBeTruthy();
    expect(e.enter).toHaveBeenCalledOnce();
    off();

    setup({ api: 'standard', refuse: true });
    const onError = vi.fn();
    const off2 = bindFullscreenShortcut({ onError });
    key({ key: 'f' });
    await flush();
    expect(onError).toHaveBeenCalledOnce();
    off2();
  });

  it('does nothing without the API', async () => {
    setup({ api: 'none' });
    const onError = vi.fn();
    const off = bindFullscreenShortcut({ onError });
    key({ key: 'f' });
    await flush();
    expect(onError).not.toHaveBeenCalled();
    off();
  });
});
