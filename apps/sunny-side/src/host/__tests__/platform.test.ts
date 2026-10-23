// Host visibility pause + Wake Lock with fake document/navigator.
import { describe, expect, it, vi } from 'vitest';
import { watchVisibility, type VisibilityDoc } from '../visibility';
import { createHostWakeLock } from '../wakeLock';

function fakeDoc(initial: DocumentVisibilityState = 'visible') {
  const target = new EventTarget();
  const doc = {
    visibilityState: initial,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    set(state: DocumentVisibilityState) {
      doc.visibilityState = state;
      target.dispatchEvent(new Event('visibilitychange'));
    },
  };
  return doc;
}

describe('watchVisibility', () => {
  it('reports the current state, then each change once', () => {
    const doc = fakeDoc();
    const seen: boolean[] = [];
    const off = watchVisibility((v) => seen.push(v), doc as unknown as VisibilityDoc);
    doc.set('hidden');
    doc.set('hidden');
    doc.set('visible');
    off();
    doc.set('hidden');
    expect(seen).toEqual([true, false, true]);
  });
});

describe('createHostWakeLock', () => {
  function fakeLock() {
    const sentinels: { released: boolean; release: () => Promise<void>; fire: () => void }[] = [];
    const request = vi.fn(async () => {
      const t = new EventTarget();
      const s = {
        released: false,
        release: async () => {
          s.released = true;
        },
        addEventListener: (type: string, cb: () => void) => t.addEventListener(type, cb),
        fire: () => {
          s.released = true;
          t.dispatchEvent(new Event('release'));
        },
      };
      sentinels.push(s);
      return s;
    });
    return { request, sentinels };
  }

  it('is a silent no-op without navigator.wakeLock (insecure LAN origin)', async () => {
    const lock = createHostWakeLock({ navigator: {}, document: fakeDoc() as never });
    expect(lock.supported).toBe(false);
    expect(await lock.request()).toBe(false);
  });

  it('requests, and re-requests after the browser releases it on hide', async () => {
    const api = fakeLock();
    const doc = fakeDoc();
    const lock = createHostWakeLock({ navigator: { wakeLock: api }, document: doc as never });
    expect(await lock.request()).toBe(true);
    expect(lock.held).toBe(true);
    api.sentinels[0]!.fire();
    doc.set('hidden');
    expect(lock.held).toBe(false);
    doc.set('visible');
    await vi.waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(lock.held).toBe(true));
    lock.dispose();
  });
});
