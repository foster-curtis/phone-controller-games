// @vitest-environment jsdom
// TV chrome (src/host/chrome.ts): the full-screen button shows on menu-like screens only, and a
// Reconnecting pill shows while the TV's own relay socket is down.
import { afterEach, describe, expect, it } from 'vitest';
import { mountHostChrome } from '../chrome';

afterEach(() => {
  document.body.replaceChildren();
});

describe('host chrome', () => {
  it('shows the full-screen button in the lobby and hides it during play', () => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      value: () => Promise.resolve(),
      configurable: true,
    });
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    const chrome = mountHostChrome();
    const button = document.querySelector<HTMLButtonElement>('.host-chrome button')!;
    expect(button.hidden).toBe(true);
    chrome.setPhase('lobby');
    expect(button.hidden).toBe(false);
    chrome.setPhase('shoot');
    expect(button.hidden).toBe(true);
    chrome.setPhase('matchEnd');
    expect(button.hidden).toBe(false);
    chrome.destroy();
  });

  it('shows Reconnecting… only while the relay socket is reconnecting', () => {
    const chrome = mountHostChrome();
    const pill = document.querySelector<HTMLElement>('.host-conn')!;
    expect(pill.hidden).toBe(true);
    chrome.setStatus('reconnecting');
    expect(pill.hidden).toBe(false);
    expect(pill.textContent).toBe('Reconnecting…');
    chrome.setStatus('open');
    expect(pill.hidden).toBe(true);
    chrome.destroy();
  });
});
