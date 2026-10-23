import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../controller.css'),
  'utf8',
);
import { sampleStandings } from '../dev';
import { mount, pointer, sampleScreen } from './helpers';
import type { Screen } from '../../shared/messages';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
});
afterEach(() => {
  vi.useRealTimers();
  const d = document as unknown as Record<string, unknown>;
  delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
  delete (document.documentElement as unknown as Record<string, unknown>).webkitRequestFullscreen;
  delete d.fullscreenElement;
});

const rule = (selector: string): string => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(css);
  return m?.[1] ?? '';
};

describe('long-list screens with 8 players', () => {
  it.each(['spectating', 'results', 'matchEnd'] as const)(
    '%s shows all 8 standings, leader buttons, and a scrollable compact list',
    (kind) => {
      const h = mount();
      const s = sampleScreen(kind) as Screen;
      expect(s.standings.length).toBe(8);
      expect(s.standings.every((x) => x.name.length === 10)).toBe(true);
      h.show(s);
      const root = h.root.querySelector(`[data-screen=${kind}]`) as HTMLElement;
      expect(root.querySelectorAll('.standing').length).toBe(8);
      const list = root.querySelector('.standings') as HTMLElement;
      expect(list.closest('.scroll-y')).not.toBeNull();
      if (kind === 'results') {
        expect(root.querySelectorAll('[data-leader=next]').length).toBe(1);
      } else if (kind === 'matchEnd') {
        expect(root.querySelectorAll('[data-leader=rematch]').length).toBe(1);
        expect(root.querySelectorAll('[data-leader=lobby]').length).toBe(1);
      } else {
        expect(root.querySelectorAll('.emoji-btn').length).toBe(5);
      }
      // Buttons live outside the scroll container so they stay pinned.
      for (const b of root.querySelectorAll('button')) expect(b.closest('.scroll-y')).toBeNull();
    },
  );

  it('css: list scrolls vertically in a 2-column grid; the playing screen stays touch-action none', () => {
    expect(rule('.scroll-y')).toMatch(/overflow-y:\s*auto/);
    expect(rule('.scroll-y')).toMatch(/touch-action:\s*pan-y/);
    expect(rule('.scroll-y .standings')).toMatch(/display:\s*grid/);
    expect(rule('.screen.play')).toMatch(/touch-action:\s*none/);
    expect(rule('.overlay')).toMatch(/touch-action:\s*none/);
    const h = mount();
    h.show(sampleScreen('playing'));
    expect(h.root.querySelector('.scroll-y')).toBeNull();
  });

  it('the default sample standings stay small', () => {
    expect(sampleStandings().length).toBe(5);
  });
});

describe('fullscreen', () => {
  const tap = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  it('requests fullscreen (hidden navigation UI) on the join tap', () => {
    const fn = vi.fn(() => Promise.resolve());
    (document.documentElement as unknown as Record<string, unknown>).requestFullscreen = fn;
    const h = mount();
    h.show(sampleScreen('lobby'));
    tap(h.root.querySelector('button[type=submit]') as HTMLElement);
    expect(fn).toHaveBeenCalledWith({ navigationUI: 'hide' });
  });

  it('re-requests on the next tap once the user left fullscreen, not while fullscreen', () => {
    const fn = vi.fn(() => Promise.resolve());
    (document.documentElement as unknown as Record<string, unknown>).requestFullscreen = fn;
    const h = mount();
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: document.documentElement,
    });
    tap(h.root);
    expect(fn).not.toHaveBeenCalled();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    tap(h.root);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('falls back to the webkit-prefixed variant', () => {
    const fn = vi.fn();
    (document.documentElement as unknown as Record<string, unknown>).webkitRequestFullscreen = fn;
    const h = mount();
    tap(h.root);
    expect(fn).toHaveBeenCalled();
  });

  it('a missing API does not throw', () => {
    const h = mount();
    expect(() => tap(h.root)).not.toThrow();
  });

  it('a rejection is swallowed', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('denied')));
    (document.documentElement as unknown as Record<string, unknown>).requestFullscreen = fn;
    const h = mount();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    tap(h.root);
    await vi.advanceTimersByTimeAsync(10);
    process.off('unhandledRejection', unhandled);
    expect(fn).toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe('round DASH / SLAM buttons (C1)', () => {
  it('visible buttons are separate round elements centered in full-size zones', () => {
    const h = mount();
    h.show(sampleScreen('playing', 'cobalt'));
    for (const id of ['dash', 'slam']) {
      const zone = h.root.querySelector(`[data-pad=${id}]`) as HTMLElement;
      const btn = zone.querySelector('.pad-btn') as HTMLElement;
      expect(btn).toBeTruthy();
      expect(btn).not.toBe(zone);
      expect(btn.parentElement).toBe(zone);
    }
    expect(rule('.pad-btn')).toMatch(/border-radius:\s*var\(--radius-round\)/);
    expect(rule('.pad-btn')).toMatch(/aspect-ratio:\s*1/);
    expect(rule('.pad-zone')).toMatch(/align-items:\s*center/);
    expect(rule('.pad-zone')).toMatch(/justify-content:\s*center/);
    expect(rule('.pad-zone')).not.toMatch(/background|border/);
  });

  it('a pointerdown on the zone (not the circle) still registers the press', () => {
    const h = mount();
    h.show(sampleScreen('playing', 'cobalt'));
    const zone = h.root.querySelector('[data-pad=slam]') as HTMLElement;
    pointer(zone, 'pointerdown', 7);
    expect(zone.classList.contains('pressed')).toBe(true);
    pointer(zone, 'pointerup', 7);
    expect(zone.classList.contains('pressed')).toBe(false);
  });
});
