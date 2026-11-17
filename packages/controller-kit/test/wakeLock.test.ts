import { describe, expect, it, vi } from 'vitest';
import { createWakeLock } from '../src/platform/wakeLock';

function env() {
  const doc = Object.assign(new EventTarget(), {
    visibilityState: 'visible' as DocumentVisibilityState,
  });
  const win = new EventTarget();
  return { doc, win };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('wake lock flags', () => {
  it('supported needs a secure context and the API; held tracks the sentinel', async () => {
    const { doc, win } = env();
    const request = vi.fn(() => Promise.resolve({ release: () => Promise.resolve() }));
    expect(createWakeLock({}, true, doc as never, win as never).supported).toBe(false);
    expect(
      createWakeLock({ wakeLock: { request } }, false, doc as never, win as never).supported,
    ).toBe(false);
    const wl = createWakeLock({ wakeLock: { request } }, true, doc as never, win as never);
    expect(wl.supported).toBe(true);
    expect(wl.held).toBe(false);
    await wl.request();
    expect(wl.held).toBe(true);
    wl.release();
    expect(wl.held).toBe(false);
  });

  it('works with every dependency missing', async () => {
    const wl = createWakeLock(undefined, false, undefined, undefined);
    expect(wl.supported).toBe(false);
    await expect(wl.request()).resolves.toBe(false);
    expect(() => wl.release()).not.toThrow();
  });
});

describe('re-acquire', () => {
  it('retakes on visible, pageshow and focus when wanted and not held', async () => {
    const { doc, win } = env();
    let sentinelRelease: (() => void) | undefined;
    const request = vi.fn(() =>
      Promise.resolve({
        release: () => Promise.resolve(),
        addEventListener: (_t: 'release', cb: () => void) => (sentinelRelease = cb),
      }),
    );
    const wl = createWakeLock({ wakeLock: { request } }, true, doc as never, win as never);
    await wl.request();
    for (const [target, type] of [
      [doc, 'visibilitychange'],
      [win, 'pageshow'],
      [win, 'focus'],
    ] as const) {
      sentinelRelease?.();
      expect(wl.held).toBe(false);
      const before = request.mock.calls.length;
      target.dispatchEvent(new Event(type));
      await tick();
      expect(request.mock.calls.length).toBe(before + 1);
      expect(wl.held).toBe(true);
    }
  });

  it('does not retake when not wanted or already held', async () => {
    const { doc, win } = env();
    const request = vi.fn(() => Promise.resolve({ release: () => Promise.resolve() }));
    const wl = createWakeLock({ wakeLock: { request } }, true, doc as never, win as never);
    win.dispatchEvent(new Event('focus'));
    await tick();
    expect(request).not.toHaveBeenCalled();
    await wl.request();
    win.dispatchEvent(new Event('focus'));
    await tick();
    expect(request).toHaveBeenCalledTimes(1);
    wl.release();
    win.dispatchEvent(new Event('focus'));
    await tick();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent requests into one', async () => {
    const { doc, win } = env();
    const request = vi.fn(() => Promise.resolve({ release: () => Promise.resolve() }));
    const wl = createWakeLock({ wakeLock: { request } }, true, doc as never, win as never);
    const a = wl.request();
    win.dispatchEvent(new Event('focus'));
    const b = wl.request();
    await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('a rejecting request never throws out of an event handler', async () => {
    const { doc, win } = env();
    const request = vi.fn(() => Promise.reject(new Error('denied')));
    const wl = createWakeLock({ wakeLock: { request } }, true, doc as never, win as never);
    await expect(wl.request()).resolves.toBe(false);
    expect(() => win.dispatchEvent(new Event('focus'))).not.toThrow();
    await tick();
    expect(wl.held).toBe(false);
  });
});
