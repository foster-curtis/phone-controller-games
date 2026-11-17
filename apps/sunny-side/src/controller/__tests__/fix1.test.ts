import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../controller.css'),
  'utf8',
);
import { searchWithCode } from '../app';
import { sampleStandings } from '../samples';
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
      for (const b of root.querySelectorAll('button:not(.remove-btn)'))
        expect(b.closest('.scroll-y')).toBeNull();
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

describe('full screen is manual (controller-compat)', () => {
  const tap = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const spy = () => {
    const fn = vi.fn(() => Promise.resolve());
    (document.documentElement as unknown as Record<string, unknown>).requestFullscreen = fn;
    return fn;
  };

  it('a tap anywhere, including the join tap, never requests full screen', () => {
    const fn = spy();
    const h = mount({ nameStep: true });
    h.show(sampleScreen('lobby'));
    tap(h.root);
    tap(h.root.querySelector('button[type=submit]') as HTMLElement);
    h.show(sampleScreen('playing', 'cobalt'));
    tap(h.root);
    expect(fn).not.toHaveBeenCalled();
  });

  it('the lobby has an inline full-screen button; the corner button is in the shell', () => {
    const h = mount();
    h.show(sampleScreen('lobby'));
    const lobby = h.root.querySelector('[data-screen=lobby]') as HTMLElement;
    const inline = lobby.querySelector('.pcg-fullscreen-btn') as HTMLElement;
    expect(inline).toBeTruthy();
    expect(inline.textContent).toBe('Full screen');
    const corner = h.root.querySelector('.pcg-fullscreen-corner') as HTMLElement;
    expect(corner).toBeTruthy();
    expect(corner.style.left).not.toBe('');
    expect(corner.style.right).toBe('');
    expect(corner.style.top).not.toBe('');
  });

  it('the join screen has an inline full-screen button', () => {
    const h = mount();
    expect(h.root.querySelector('[data-screen=joining] .pcg-fullscreen-btn')).toBeTruthy();
  });

  it('the inline button asks for full screen only when tapped', async () => {
    const fn = spy();
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    try {
      const h = mount();
      h.show(sampleScreen('lobby'));
      expect(fn).not.toHaveBeenCalled();
      const btn = h.root.querySelector('[data-screen=lobby] .pcg-fullscreen-btn') as HTMLElement;
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      delete (document as unknown as Record<string, unknown>).fullscreenEnabled;
    }
  });

  it('without the API the button opens the install sheet instead and nothing throws', () => {
    const h = mount();
    h.show(sampleScreen('lobby'));
    const btn = h.root.querySelector('[data-screen=lobby] .pcg-fullscreen-btn') as HTMLElement;
    expect(() =>
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })),
    ).not.toThrow();
    expect(document.querySelector('.pcg-sheet')).toBeTruthy();
    document.querySelector('.pcg-sheet')?.remove();
  });
});

describe('join code navigation keeps other params', () => {
  it('searchWithCode sets the code and keeps debug', () => {
    expect(searchWithCode('?debug=1', 'ABCD')).toBe('?debug=1&code=ABCD');
    expect(searchWithCode('?code=OLD&debug=1', 'NEW')).toBe('?code=NEW&debug=1');
    expect(searchWithCode('', 'AB CD')).toBe('?code=AB+CD');
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
    expect(rule('.pad-zone')).not.toMatch(/background|(?<!-)border(-\w+)?:/);
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
