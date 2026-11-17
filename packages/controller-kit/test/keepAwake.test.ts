import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { el } from '../src/dom';
import { createKeepAwakeHint, KEEP_AWAKE_SEEN_KEY } from '../src/platform/keepAwake';
import type { WakeLock } from '../src/platform/wakeLock';

function mem() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}
type MutableLock = { -readonly [K in keyof WakeLock]: WakeLock[K] };
const lock = (supported: boolean, held = false): MutableLock => ({
  supported,
  held,
  request: () => Promise.resolve(held),
  release() {},
});
const touch = (host: HTMLElement) =>
  host.dispatchEvent(new Event('pointerdown', { bubbles: true }));

let host: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers();
  host = el('div');
  document.body.append(host);
});
afterEach(() => {
  vi.useRealTimers();
  host.remove();
});

describe('keep-awake hint', () => {
  it('does not appear before the first touch', () => {
    createKeepAwakeHint({ host, wakeLock: lock(false), storage: mem() });
    vi.advanceTimersByTime(5000);
    expect(host.querySelector('.pcg-hint')).toBeNull();
  });

  it('shows immediately on first touch when unsupported, once per browser', () => {
    const storage = mem();
    const h = createKeepAwakeHint({ host, wakeLock: lock(false), storage });
    touch(host);
    const hint = host.querySelector<HTMLElement>('.pcg-hint')!;
    expect(hint).not.toBeNull();
    expect(hint.style.position).toBe('fixed');
    expect(storage.m.get(KEEP_AWAKE_SEEN_KEY)).toBeTruthy();
    hint.querySelector<HTMLButtonElement>('button')!.click();
    expect(host.querySelector('.pcg-hint')).toBeNull();
    h.destroy();
    createKeepAwakeHint({ host, wakeLock: lock(false), storage });
    touch(host);
    expect(host.querySelector('.pcg-hint')).toBeNull();
  });

  it('supported: shows about 1s later only if still not held', () => {
    createKeepAwakeHint({ host, wakeLock: lock(true, false), storage: mem() });
    touch(host);
    expect(host.querySelector('.pcg-hint')).toBeNull();
    vi.advanceTimersByTime(1100);
    expect(host.querySelector('.pcg-hint')).not.toBeNull();

    host.replaceChildren();
    const w = lock(true, false);
    createKeepAwakeHint({ host, wakeLock: w, storage: mem() });
    touch(host);
    w.held = true;
    vi.advanceTimersByTime(1100);
    expect(host.querySelector('.pcg-hint')).toBeNull();
  });

  it('never shows with no wake lock; survives broken storage; destroy cleans up', () => {
    createKeepAwakeHint({ host, wakeLock: null, storage: mem() });
    touch(host);
    expect(host.querySelector('.pcg-hint')).toBeNull();

    const boom = () => {
      throw new Error('storage');
    };
    const bad = { getItem: boom, setItem: boom, removeItem: boom };
    const h = createKeepAwakeHint({ host, wakeLock: lock(false), storage: bad });
    expect(() => touch(host)).not.toThrow();
    expect(host.querySelector('.pcg-hint')).not.toBeNull();
    h.destroy();
    expect(host.querySelector('.pcg-hint')).toBeNull();
  });

  it('custom text; destroy before the first touch shows nothing', () => {
    const h = createKeepAwakeHint({ host, wakeLock: lock(false), storage: mem() });
    h.destroy();
    touch(host);
    expect(host.querySelector('.pcg-hint')).toBeNull();
    const h2 = createKeepAwakeHint({
      host,
      wakeLock: lock(false),
      storage: mem(),
      text: { title: 'Hi' },
    });
    touch(host);
    expect(host.querySelector('.pcg-hint-title')!.textContent).toBe('Hi');
    h2.destroy();
  });
});
