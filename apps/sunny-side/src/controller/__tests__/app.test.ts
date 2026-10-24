import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUTTON_DASH, PLAYER_COLOR_IDS, type Screen, type ScreenKind } from '../../shared/messages';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../controller.css'),
  'utf8',
);
import { SCREEN_KINDS } from '../screens';
import { createWakeLock } from '../wakeLock';
import { mount, pointer, sampleScreen } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
});
afterEach(() => vi.useRealTimers());

const q = (root: ParentNode, sel: string) => root.querySelector<HTMLElement>(sel);

describe('screens', () => {
  it('starts on the joining screen', () => {
    const h = mount();
    expect(q(h.root, '[data-screen=joining]')).not.toBeNull();
    expect(q(h.root, '.code')?.textContent).toBe('ABCD');
    expect(q(h.root, 'img.mark')).not.toBeNull();
  });

  it.each(SCREEN_KINDS)('renders [data-screen=%s]', (kind: ScreenKind) => {
    const h = mount();
    h.show(sampleScreen(kind));
    expect(q(h.root, `[data-screen=${kind}]`)).not.toBeNull();
    expect(h.root.querySelectorAll('[data-screen]').length).toBe(1);
  });

  it('keeps the play surface across countdown → playing → ghost', () => {
    const h = mount();
    h.show(sampleScreen('countdown'));
    const surface = q(h.root, '.play');
    h.show(sampleScreen('playing'));
    expect(q(h.root, '.play')).toBe(surface);
    expect(q(h.root, '[data-screen=playing]')).toBe(surface);
  });

  it('the ghost screen has one grey pulse button, no dampening, and tapping it pulses', () => {
    const h = mount();
    h.show(sampleScreen('playing'));
    expect(h.root.querySelectorAll('.pad-zone').length).toBe(2);
    h.show(sampleScreen('ghost', 'cobalt'));
    const play = q(h.root, '[data-screen=ghost]') as HTMLElement;
    expect(play.classList.contains('dampened')).toBe(false);
    const pads = play.querySelectorAll('.pad-zone');
    expect(pads.length).toBe(1);
    const pulse = pads[0] as HTMLElement;
    expect(pulse.classList.contains('pulse')).toBe(true);
    expect(css).toMatch(/\.pad-zone\.pulse \.pad-btn\s*\{[^}]*background:\s*var\(--brand-gray\)/);
    expect(css).not.toMatch(/dampened/);
    const before = h.tuples().length;
    pointer(pulse, 'pointerdown', 1);
    pointer(pulse, 'pointerup', 1);
    const sent = h.tuples().slice(before);
    expect(sent.some((t) => (t[2] ?? 0) & BUTTON_DASH && t[3] === 1)).toBe(true);
    // Back to a live round: DASH + SLAM return.
    h.show(sampleScreen('playing'));
    expect(h.root.querySelectorAll('.pad-zone').length).toBe(2);
  });

  it('does not tint the pads with the player color (M5-fix-3)', () => {
    const h = mount();
    h.show(sampleScreen('playing', 'cobalt'));
    expect(q(h.root, '.pads')?.outerHTML).not.toContain('--player-');
    expect(q(h.root, '.play')?.style.getPropertyValue('--pad-bg')).toBe('');
  });

  it('eliminated shows a big countdown from respawnMs', () => {
    const h = mount();
    const s = sampleScreen('eliminated') as Extract<Screen, { kind: 'eliminated' }>;
    h.show(s);
    expect(q(h.root, '.title')?.textContent).toBe('5');
    h.show({ ...s, respawnMs: 3200 });
    expect(q(h.root, '.title')?.textContent).toBe('4');
  });

  it('ignores unknown or malformed messages', () => {
    const h = mount();
    h.client.emit({ t: 'screen', screen: { kind: 'nope' } });
    h.client.emit('hello');
    h.client.emit(null);
    expect(q(h.root, '[data-screen=joining]')).not.toBeNull();
  });
});

describe('leader controls', () => {
  const leaderCases: Array<[ScreenKind, string, string]> = [
    ['lobby', 'start', 'Start'],
    ['results', 'next', 'Next round'],
    ['matchEnd', 'rematch', 'Rematch'],
    ['matchEnd', 'lobby', 'Back to lobby'],
  ];

  it.each(leaderCases)('%s: %s is leader-only and sends the leader action', (kind, action) => {
    const h = mount();
    const screen = sampleScreen(kind);
    h.show({ ...screen, isLeader: false });
    expect(q(h.root, `[data-leader=${action}]`)).toBeNull();
    h.show({ ...screen, isLeader: true });
    const btn = q(h.root, `[data-leader=${action}]`) as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(h.msgs()).toContainEqual({ t: 'leader', action });
  });

  it('non-leaders see no leader buttons on any screen', () => {
    const h = mount();
    for (const kind of SCREEN_KINDS) {
      h.show({ ...sampleScreen(kind), isLeader: false });
      expect(h.root.querySelectorAll('[data-leader]').length).toBe(0);
    }
  });
});

describe('lobby', () => {
  it('prefills the name from localStorage and saves it on submit', () => {
    const h = mount({ name: 'Yolko' });
    h.show(sampleScreen('lobby'));
    const input = q(h.root, 'input[name=name]') as HTMLInputElement;
    expect(input.value).toBe('Yolko');
    input.value = '  Benedict Eggs Extra ';
    q(h.root, 'form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(localStorage.getItem('sunny-side:name')).toBe('Benedict E');
    expect(h.msgs().at(-1)).toMatchObject({ t: 'profile', name: 'Benedict E', color: 'crimson' });
  });

  it('shows 8 swatches, ring on the chosen one, taken ones disabled', () => {
    const h = mount();
    h.show(sampleScreen('lobby'));
    const sw = [...h.root.querySelectorAll<HTMLButtonElement>('.swatch')];
    expect(sw.map((s) => s.dataset.color)).toEqual([...PLAYER_COLOR_IDS]);
    expect(sw.filter((s) => s.classList.contains('selected')).map((s) => s.dataset.color)).toEqual([
      'crimson',
    ]);
    expect(sw.filter((s) => s.disabled).map((s) => s.dataset.color)).toEqual(['cobalt', 'jade']);
    sw.find((s) => s.dataset.color === 'sky')?.click();
    expect(h.msgs().at(-1)).toMatchObject({ t: 'profile', color: 'sky' });
    expect(q(h.root, '.swatch.selected')?.dataset.color).toBe('sky');
  });

  it('shows the brand mark', () => {
    const h = mount();
    h.show(sampleScreen('lobby'));
    expect(q(h.root, 'img.mark')).not.toBeNull();
  });
});

describe('overlays', () => {
  it('reconnecting status shows the reconnecting overlay', () => {
    const h = mount();
    h.show(sampleScreen('playing'));
    expect(q(h.root, '[data-overlay=reconnecting]')).toBeNull();
    h.client.setStatus('reconnecting');
    expect(q(h.root, '[data-overlay=reconnecting]')).not.toBeNull();
    h.client.setStatus('open');
    expect(q(h.root, '[data-overlay=reconnecting]')).toBeNull();
  });

  it('host away shows its overlay', () => {
    const h = mount();
    h.client.setHostStatus('away');
    expect(q(h.root, '[data-overlay=hostAway]')).not.toBeNull();
    h.client.setHostStatus('present');
    expect(q(h.root, '[data-overlay=hostAway]')).toBeNull();
  });

  it('hold-to-pause opens the self-paused overlay; Resume sends resume', () => {
    const h = mount();
    h.show(sampleScreen('playing'));
    pointer(q(h.root, '.pause-btn') as HTMLElement, 'pointerdown', 7);
    vi.advanceTimersByTime(600);
    expect(h.msgs()).toContainEqual({ t: 'pause' });
    expect(q(h.root, '[data-overlay=selfPaused]')).not.toBeNull();
    (q(h.root, '[data-overlay=selfPaused] .btn-accent') as HTMLButtonElement).click();
    expect(h.msgs().at(-1)).toEqual({ t: 'resume' });
    expect(q(h.root, '[data-overlay=selfPaused]')).toBeNull();
  });

  it('self-paused Leave sends leave', () => {
    const h = mount();
    h.show(sampleScreen('playing'));
    h.app.setOverlay('selfPaused', true);
    const leave = [
      ...h.root.querySelectorAll<HTMLButtonElement>('[data-overlay=selfPaused] .btn'),
    ].find((b) => b.textContent === 'Leave game');
    leave?.click();
    expect(h.msgs().at(-1)).toEqual({ t: 'leave' });
    expect(q(h.root, '[data-overlay=selfPaused]')).toBeNull();
  });

  it('game paused screen has Leave game', () => {
    const h = mount();
    h.show(sampleScreen('gamePaused'));
    (q(h.root, '[data-screen=gamePaused] .btn') as HTMLButtonElement).click();
    expect(h.msgs().at(-1)).toEqual({ t: 'leave' });
  });

  it('shows the rotate overlay in portrait only', () => {
    const h = mount();
    h.app.setOverlay('rotate', true);
    expect(q(h.root, '[data-overlay=rotate]')).not.toBeNull();
    h.app.setOverlay('rotate', false);
    expect(q(h.root, '[data-overlay=rotate]')).toBeNull();
  });
});

describe('input over the app', () => {
  it('sends tuples while on the play surface and stops after leaving it', () => {
    const h = mount();
    h.show(sampleScreen('playing'));
    expect(h.tuples().length).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(h.tuples().length).toBe(6);
    h.show(sampleScreen('results'));
    const n = h.tuples().length;
    vi.advanceTimersByTime(1000);
    expect(h.tuples().length).toBe(n);
  });

  it('pressing DASH sends the button bit and counter', () => {
    const h = mount();
    h.show(sampleScreen('playing'));
    pointer(q(h.root, '[data-pad=dash]') as HTMLElement, 'pointerdown', 3);
    expect(h.tuples().at(-1)).toEqual([0, 0, 1, 1, 0]);
    pointer(q(h.root, '[data-pad=dash]') as HTMLElement, 'pointerup', 3);
    expect(h.tuples().at(-1)).toEqual([0, 0, 0, 1, 0]);
  });

  it('SLAM arc sweep/thickness tracks hold time', () => {
    const h = mount();
    h.show(sampleScreen('playing'));
    const slam = q(h.root, '[data-pad=slam]') as HTMLElement;
    const arc = q(slam, '.charge-arc') as unknown as SVGElement;
    expect(arc.hasAttribute('hidden')).toBe(true);
    pointer(slam, 'pointerdown', 4);
    vi.advanceTimersByTime(500);
    expect(Number(arc.dataset.endAngle)).toBeCloseTo(-15, -1);
    pointer(slam, 'pointerup', 4);
    expect(arc.hasAttribute('hidden')).toBe(true);
  });
});

describe('spectating emoji hotbar', () => {
  it('has 5 reactions with a 0.5 s local cooldown', () => {
    const h = mount();
    h.show(sampleScreen('spectating'));
    const btns = [...h.root.querySelectorAll<HTMLButtonElement>('.emoji-btn')];
    expect(btns.length).toBe(5);
    btns[2]?.click();
    btns[2]?.click();
    btns[0]?.click();
    expect(h.msgs().filter((m) => m.t === 'emoji')).toEqual([{ t: 'emoji', i: 2 }]);
    vi.advanceTimersByTime(499);
    btns[1]?.click();
    expect(h.msgs().filter((m) => m.t === 'emoji').length).toBe(1);
    vi.advanceTimersByTime(1);
    btns[1]?.click();
    expect(h.msgs().filter((m) => m.t === 'emoji')).toEqual([
      { t: 'emoji', i: 2 },
      { t: 'emoji', i: 1 },
    ]);
  });
});

describe('wake lock', () => {
  it('a missing Wake Lock API does not throw', async () => {
    const wl = createWakeLock({}, true, undefined);
    await expect(wl.request()).resolves.toBe(false);
    expect(() => wl.release()).not.toThrow();
  });

  it('is skipped on insecure origins', async () => {
    const request = vi.fn();
    const wl = createWakeLock({ wakeLock: { request } }, false, undefined);
    await expect(wl.request()).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('acquires on secure origins and survives a rejecting API', async () => {
    const release = vi.fn(() => Promise.resolve());
    const ok = createWakeLock(
      { wakeLock: { request: () => Promise.resolve({ release }) } },
      true,
      undefined,
    );
    await expect(ok.request()).resolves.toBe(true);
    ok.release();
    expect(release).toHaveBeenCalled();
    const bad = createWakeLock(
      { wakeLock: { request: () => Promise.reject(new Error('denied')) } },
      true,
      undefined,
    );
    await expect(bad.request()).resolves.toBe(false);
  });
});
