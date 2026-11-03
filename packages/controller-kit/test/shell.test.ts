import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDevHarness, createLocalClient, isDevMode } from '../src/dev';
import { el } from '../src/dom';
import { fullscreenOnTap } from '../src/platform/fullscreen';
import { isPortrait, watchOrientation } from '../src/platform/orientation';
import { LOCKED_VIEWPORT, lockViewport, readSafeInsets, safePad } from '../src/platform/viewport';
import { createWakeLock } from '../src/platform/wakeLock';
import { createAppShell, type ShellOverlay } from '../src/shell/app';
import { createOverlayLayer } from '../src/shell/overlays';
import { createScreenRouter, type RoutedView } from '../src/shell/router';
import { defaultStorage, readStored, writeStored } from '../src/storage';
import { pointer } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.useRealTimers();
  delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
  delete (document as unknown as Record<string, unknown>).fullscreenElement;
});

const TEXT: Record<ShellOverlay | 'paused', { title: string; body: string }> = {
  reconnecting: { title: 'Reconnecting…', body: 'Hang tight.' },
  hostAway: { title: 'Host away', body: 'Waiting for the TV.' },
  rotate: { title: 'Rotate your phone', body: 'Landscape only.' },
  paused: { title: 'Paused', body: 'You paused.' },
};
const ORDER = ['paused', 'reconnecting', 'hostAway', 'rotate'] as const;

describe('wake lock', () => {
  it('no API → false, never throws; insecure → skipped', async () => {
    const wl = createWakeLock({}, true, undefined);
    await expect(wl.request()).resolves.toBe(false);
    expect(() => wl.release()).not.toThrow();
    const request = vi.fn();
    await expect(
      createWakeLock({ wakeLock: { request } }, false, undefined).request(),
    ).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('acquires on secure origins and re-acquires on return to visible', async () => {
    const release = vi.fn(() => Promise.resolve());
    const request = vi.fn(() => Promise.resolve({ release }));
    const doc = Object.assign(new EventTarget(), {
      visibilityState: 'visible' as DocumentVisibilityState,
    });
    const wl = createWakeLock({ wakeLock: { request } }, true, doc as never);
    await expect(wl.request()).resolves.toBe(true);
    wl.release();
    expect(release).toHaveBeenCalled();
    await expect(
      createWakeLock(
        { wakeLock: { request: () => Promise.reject(new Error('no')) } },
        true,
        undefined,
      ).request(),
    ).resolves.toBe(false);
  });
});

describe('fullscreen on tap', () => {
  it('requests on every tap while not fullscreen; silent where unsupported', () => {
    const root = el('div');
    document.body.append(root);
    const off = fullscreenOnTap(root);
    expect(() => root.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();
    const fn = vi.fn(() => Promise.resolve());
    (document.documentElement as unknown as Record<string, unknown>).requestFullscreen = fn;
    root.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fn).toHaveBeenCalledWith({ navigationUI: 'hide' });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: root });
    root.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });
});

describe('orientation and viewport', () => {
  it('reports portrait now and on resize', () => {
    const win = Object.assign(new EventTarget(), { innerWidth: 400, innerHeight: 800 });
    const seen: boolean[] = [];
    const off = watchOrientation((p) => seen.push(p), win as unknown as Window);
    win.innerWidth = 800;
    win.innerHeight = 400;
    win.dispatchEvent(new Event('resize'));
    off();
    expect(seen).toEqual([true, false]);
    expect(isPortrait({ innerWidth: 10, innerHeight: 20 })).toBe(true);
  });

  it('locks the viewport meta and blocks pinch zoom', () => {
    document.head.innerHTML = '<meta name="viewport" content="width=device-width">';
    const off = lockViewport();
    expect(document.querySelector<HTMLMetaElement>('meta[name=viewport]')!.content).toBe(
      LOCKED_VIEWPORT,
    );
    const ev = new Event('gesturestart', { cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    off();
    document.head.innerHTML = '';
    lockViewport()();
    expect(document.querySelectorAll('meta[name=viewport]').length).toBe(1);
  });

  it('safe-area helpers', () => {
    expect(safePad('left', '16px')).toBe('max(16px, env(safe-area-inset-left))');
    expect(readSafeInsets()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(document.body.children.length).toBe(0); // the probe is removed
  });
});

describe('storage', () => {
  it('never throws', () => {
    writeStored('k', 'v', defaultStorage());
    expect(readStored('k')).toBe('v');
    const broken = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
      removeItem: () => {},
    };
    expect(readStored('k', broken)).toBeNull();
    expect(() => writeStored('k', 'v', broken)).not.toThrow();
  });
});

describe('overlay layer', () => {
  it('renders copy and classes as parameters; order follows activation', () => {
    const host = el('div');
    const layer = createOverlayLayer({
      host,
      names: ORDER,
      text: TEXT,
      classes: { title: 'h2', body: 'body' },
      extra: (n) => (n === 'paused' ? el('div', { class: 'actions' }) : null),
    });
    layer.set('hostAway', true);
    layer.set('paused', true);
    expect([...host.children].map((c) => (c as HTMLElement).dataset.overlay)).toEqual([
      'hostAway',
      'paused',
    ]);
    expect(layer.active()).toEqual(['paused', 'hostAway']);
    const card = host.querySelector('[data-overlay=paused] .overlay-card')!;
    expect(card.querySelector('h1.h2')!.textContent).toBe('Paused');
    expect(card.querySelector('p.body')!.textContent).toBe('You paused.');
    expect(card.querySelector('.actions')).not.toBeNull();
    layer.set('hostAway', false);
    expect(host.querySelector('[data-overlay=hostAway]')).toBeNull();
  });
});

describe('screen router', () => {
  type S = { kind: 'countdown' | 'playing' | 'results'; n: number };
  it('reuses the view within a group and replaces it across groups', () => {
    const host = el('div');
    const created: string[] = [];
    const destroyed: string[] = [];
    const router = createScreenRouter<S, 'play' | 'results'>({
      host,
      groupOf: (s) => (s.kind === 'results' ? 'results' : 'play'),
      create: (s): RoutedView<S> => {
        created.push(s.kind);
        const node = el('section', { 'data-n': String(s.n) });
        return {
          el: node,
          update: (u) => (node.dataset.n = String(u.n)),
          destroy: () => destroyed.push(s.kind),
        };
      },
    });
    router.show({ kind: 'countdown', n: 1 });
    const first = host.firstElementChild;
    router.show({ kind: 'playing', n: 2 });
    expect(host.firstElementChild).toBe(first); // same DOM: a held thumb survives
    expect((first as HTMLElement).dataset.n).toBe('2');
    router.show({ kind: 'results', n: 3 });
    expect(created).toEqual(['countdown', 'results']);
    expect(destroyed).toEqual(['countdown']);
    expect(router.group()).toBe('results');

    const joining = el('div', { class: 'joining' });
    router.showLocal('joining', joining);
    expect(destroyed).toEqual(['countdown', 'results']);
    expect(host.firstElementChild).toBe(joining);
    // A host screen after a local one always mounts a fresh view.
    router.show({ kind: 'results', n: 4 });
    expect(created).toEqual(['countdown', 'results', 'results']);
    const localView = { destroy: vi.fn() };
    router.showLocal('removed', el('div'), localView);
    router.show({ kind: 'playing', n: 5 });
    expect(localView.destroy).toHaveBeenCalled();
  });
});

describe('app shell', () => {
  function mount(platform = {}) {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app')!;
    const client = createLocalClient();
    const header = el('header', { class: 'banner' });
    const shell = createAppShell<'paused'>({
      root,
      client,
      header,
      overlays: ORDER,
      text: TEXT,
      platform,
    });
    return { root, client, shell, header };
  }

  it('lays out header, screen host and overlay host', () => {
    const { root, shell, header } = mount();
    expect([...root.children]).toEqual([header, shell.screenHost, shell.overlayHost]);
    expect(shell.screenHost.className).toBe('screen-host');
    expect(shell.overlayHost.className).toBe('overlay-host');
  });

  it('drives reconnecting and host-away overlays from the client', () => {
    const { client, shell, root } = mount();
    client.setStatus('reconnecting');
    expect(root.querySelector('[data-overlay=reconnecting] h1')!.textContent).toBe('Reconnecting…');
    client.setStatus('open');
    client.setHostStatus('away');
    expect(shell.overlays()).toEqual(['hostAway']);
    client.setHostStatus('present');
    shell.setOverlay('paused', true);
    expect(shell.overlays()).toEqual(['paused']);
    shell.destroy();
    client.setHostStatus('away');
    expect(shell.overlays()).toEqual(['paused']);
  });

  it('shows the rotate overlay in portrait', () => {
    const win = Object.assign(new EventTarget(), { innerWidth: 400, innerHeight: 800 });
    document.body.innerHTML = '<div id="app"></div>';
    const shell = createAppShell({
      root: document.getElementById('app')!,
      overlays: ORDER.filter((n) => n !== 'paused'),
      text: TEXT,
      window: win as unknown as Window,
    });
    expect(shell.overlays()).toEqual(['rotate']);
    win.innerWidth = 900;
    win.dispatchEvent(new Event('resize'));
    expect(shell.overlays()).toEqual([]);
  });

  it('fullscreen on tap is on by default and can be turned off', () => {
    const fn = vi.fn(() => Promise.resolve());
    (document.documentElement as unknown as Record<string, unknown>).requestFullscreen = fn;
    const on = mount();
    on.root.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fn).toHaveBeenCalledTimes(1);
    const off = mount({ fullscreen: false, landscape: false });
    off.root.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    pointer(off.root, 'pointerdown', 1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('takes the wake lock on the first touch only', () => {
    const { root, shell } = mount({ landscape: false });
    const spy = vi.spyOn(shell.wakeLock!, 'request');
    pointer(root, 'pointerdown', 1);
    pointer(root, 'pointerdown', 2);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('dev harness', () => {
  it('detects ?dev=1 and lays out stage, readout, toggle and rows', () => {
    expect(isDevMode('?dev=1')).toBe(true);
    expect(isDevMode('?code=ABCD')).toBe(false);
    const root = el('div');
    const h = createDevHarness(root);
    expect([...root.children].map((c) => c.className)).toEqual([
      'dev-stage',
      'dev-readout',
      'dev-toggle',
      'dev-panel',
    ]);
    const clicked: string[] = [];
    h.addRow('screen', [
      { id: 'lobby', onClick: () => clicked.push('lobby') },
      { id: 'playing', label: 'Play', onClick: () => clicked.push('playing') },
    ]);
    expect(h.panel.hidden).toBe(true);
    (root.querySelector('.dev-toggle') as HTMLButtonElement).click();
    expect(h.panel.hidden).toBe(false);
    (root.querySelector('[data-dev-screen=playing]') as HTMLButtonElement).click();
    expect(clicked).toEqual(['playing']);
    expect(root.querySelector('[data-dev-screen=playing]')!.textContent).toBe('Play');
    h.setReadout([1, -2, 3]);
    expect(h.readout.textContent).toBe('[1, -2, 3]');
  });

  it('the local client records sends and emits host events', async () => {
    const c = createLocalClient();
    const got: unknown[] = [];
    c.onMessage((d) => got.push(d));
    c.emit({ t: 'x' });
    c.send([1, 2]);
    expect(got).toEqual([{ t: 'x' }]);
    expect(c.sent).toEqual([[1, 2]]);
    await expect(c.connect()).resolves.toEqual({ playerId: 'dev' });
    const kicked = vi.fn();
    c.onKicked(kicked);
    c.kick();
    expect(kicked).toHaveBeenCalled();
    expect(c.status).toBe('closed');
  });
});
