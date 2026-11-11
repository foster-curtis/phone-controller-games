// The shipped script (SPEC: Build and hosting; BUILD_PLAN §8): wires the kit's theme toggle, survives
// blocked storage and a missing matchMedia, and only injects analytics in production.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { inject } = vi.hoisted(() => ({ inject: vi.fn() }));
vi.mock('@vercel/analytics', () => ({ inject }));

const MARKUP = `
  <a class="brand-lockup" href="/"><span class="brand-mark"><svg class="brand-mark-morph"></svg></span>
  <span class="brand-lockup-text"></span></a>
  <button type="button" class="theme-toggle" aria-label="Switch to light mode"></button>`;

/** Imports main.ts fresh, which runs `main()` once (the document is already loaded in jsdom). */
async function runMain(): Promise<void> {
  vi.resetModules();
  await import('../main.ts');
}

const toggle = () => document.querySelector<HTMLButtonElement>('.theme-toggle')!;

describe('main', () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = 'dark';
    document.body.innerHTML = MARKUP;
    localStorage.clear();
    inject.mockClear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('wires the theme toggle: flips data-theme and the label, and stores the choice', async () => {
    await runMain();
    expect(toggle().getAttribute('aria-label')).toBe('Switch to light mode');

    toggle().click();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(toggle().getAttribute('aria-label')).toBe('Switch to dark mode');
    expect(localStorage.getItem('theme')).toBe('light');

    toggle().click();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(toggle().getAttribute('aria-label')).toBe('Switch to light mode');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it("doesn't throw when localStorage throws", async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await runMain();
    expect(() => toggle().click()).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it("doesn't throw when matchMedia is missing, and the toggle still works", async () => {
    vi.stubGlobal('matchMedia', undefined);
    await expect(runMain()).resolves.toBeUndefined();
    toggle().click();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it("doesn't inject analytics outside production", async () => {
    await runMain();
    expect(import.meta.env.PROD).toBe(false);
    expect(inject).not.toHaveBeenCalled();
  });
});
