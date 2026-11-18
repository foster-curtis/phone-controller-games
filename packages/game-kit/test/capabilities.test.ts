import { describe, expect, it, vi } from 'vitest';
import { detectCapabilities, fullscreenApi, isStandalone } from '../src/capabilities';

const noMatch = () => ({ matches: false });

function fakeDoc(extra: Record<string, unknown> = {}, rootExtra: Record<string, unknown> = {}) {
  const listeners = new Map<string, Set<() => void>>();
  return {
    documentElement: { ...rootExtra },
    addEventListener: (t: string, cb: () => void) => {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t)!.add(cb);
    },
    removeEventListener: (t: string, cb: () => void) => listeners.get(t)?.delete(cb),
    fire: (t: string) => listeners.get(t)?.forEach((cb) => cb()),
    ...extra,
  };
}

describe('detectCapabilities', () => {
  it('reports everything missing, without throwing, in an empty environment', () => {
    expect(detectCapabilities({})).toEqual({
      secureContext: false,
      wakeLock: false,
      fullscreen: false,
      vibrate: false,
      orientationLock: false,
      motion: 'unsupported',
      standalone: false,
      clipboard: false,
    });
  });

  it('needs a secure context for Wake Lock and the clipboard', () => {
    const navigator = { wakeLock: { request: vi.fn() }, clipboard: { writeText: vi.fn() } };
    expect(detectCapabilities({ window: { isSecureContext: false }, navigator }).wakeLock).toBe(
      false,
    );
    const caps = detectCapabilities({ window: { isSecureContext: true }, navigator });
    expect(caps.wakeLock).toBe(true);
    expect(caps.clipboard).toBe(true);
  });

  it('detects vibration, orientation lock and the iOS motion prompt', () => {
    const caps = detectCapabilities({
      window: {
        screen: { orientation: { lock: () => Promise.resolve() } },
        DeviceOrientationEvent: { requestPermission: () => Promise.resolve('granted') },
      },
      navigator: { vibrate: () => true },
    });
    expect(caps.vibrate).toBe(true);
    expect(caps.orientationLock).toBe(true);
    expect(caps.motion).toBe('prompt');
    expect(detectCapabilities({ window: { DeviceOrientationEvent: function () {} } }).motion).toBe(
      'granted-by-default',
    );
  });

  it('survives getters that throw', () => {
    const window = {
      get isSecureContext(): boolean {
        throw new Error('nope');
      },
    };
    expect(() => detectCapabilities({ window })).not.toThrow();
  });
});

describe('isStandalone', () => {
  it('reads display-mode and iOS navigator.standalone', () => {
    expect(isStandalone({ window: { matchMedia: noMatch } })).toBe(false);
    expect(
      isStandalone({
        window: { matchMedia: (q: string) => ({ matches: q.includes('standalone') }) },
      }),
    ).toBe(true);
    expect(isStandalone({ navigator: { standalone: true } })).toBe(true);
  });
});

describe('fullscreenApi', () => {
  it('is unsupported with no document, no request function, or fullscreenEnabled false', async () => {
    expect(fullscreenApi(undefined).supported).toBe(false);
    expect(fullscreenApi(fakeDoc() as never).supported).toBe(false);
    const disabled = fakeDoc({ fullscreenEnabled: false }, { requestFullscreen: vi.fn() });
    const api = fullscreenApi(disabled as never);
    expect(api.supported).toBe(false);
    await expect(api.enter()).resolves.toBe(false);
  });

  it('uses the standard API, resolving false when refused', async () => {
    const requestFullscreen = vi.fn().mockRejectedValueOnce(new Error('denied'));
    const doc = fakeDoc({ fullscreenEnabled: true }, { requestFullscreen });
    const api = fullscreenApi(doc as never);
    expect(api.supported).toBe(true);
    await expect(api.enter()).resolves.toBe(false);
    requestFullscreen.mockResolvedValueOnce(undefined);
    await expect(api.enter()).resolves.toBe(true);
    expect(requestFullscreen).toHaveBeenLastCalledWith({ navigationUI: 'hide' });
  });

  it('falls back to the webkit API and reports changes', async () => {
    const webkitRequestFullscreen = vi.fn();
    const webkitExitFullscreen = vi.fn();
    const doc = fakeDoc(
      { webkitFullscreenEnabled: true, webkitFullscreenElement: null, webkitExitFullscreen },
      { webkitRequestFullscreen },
    );
    const api = fullscreenApi(doc as never);
    const seen: boolean[] = [];
    const off = api.onChange((a) => seen.push(a));
    await expect(api.enter()).resolves.toBe(true);
    (doc as Record<string, unknown>).webkitFullscreenElement = doc.documentElement;
    doc.fire('webkitfullscreenchange');
    expect(api.isActive()).toBe(true);
    await expect(api.exit()).resolves.toBe(true);
    expect(webkitExitFullscreen).toHaveBeenCalled();
    off();
    doc.fire('webkitfullscreenchange');
    expect(seen).toEqual([true]);
  });
});
