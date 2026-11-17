// Hostile-environment fixtures for the cross-browser compat e2e specs (controller-compat F4, see
// docs/notes/controller-compat.md). Each one is an init script (`context.addInitScript`, runs before
// page scripts) or a page action. Node only, never bundled into a page. Re-exported by `./e2e`.
import type { BrowserContext, Page } from '@playwright/test';

/** Browser APIs `removeApis` can delete, as a phone browser without them would look. */
export type RemovableApi = 'wakeLock' | 'fullscreen' | 'vibrate' | 'orientationLock' | 'clipboard';

/**
 * Deletes the named APIs before any page script runs. `fullscreen` removes
 * `Element.prototype.requestFullscreen`/`webkitRequestFullscreen` and makes
 * `document.fullscreenEnabled` false (iPhone Safari); `orientationLock` removes
 * `screen.orientation.lock` (Firefox, iOS).
 */
export async function removeApis(
  context: BrowserContext,
  apis: readonly RemovableApi[],
): Promise<void> {
  await context.addInitScript((names) => {
    const kill = (target: object | undefined, key: string): void => {
      if (!target) return;
      try {
        delete (target as Record<string, unknown>)[key];
      } catch {
        /* non-configurable: fall through to the override below */
      }
      if (key in target) {
        try {
          Object.defineProperty(target, key, { value: undefined, configurable: true });
        } catch {
          /* leave it */
        }
      }
    };
    for (const name of names) {
      if (name === 'wakeLock') {
        kill(Navigator.prototype, 'wakeLock');
        kill(navigator, 'wakeLock');
      } else if (name === 'fullscreen') {
        kill(Element.prototype, 'requestFullscreen');
        kill(Element.prototype, 'webkitRequestFullscreen');
        kill(Element.prototype, 'webkitRequestFullScreen');
        kill(Element.prototype, 'mozRequestFullScreen');
        for (const key of ['fullscreenEnabled', 'webkitFullscreenEnabled']) {
          Object.defineProperty(document, key, { get: () => false, configurable: true });
        }
      } else if (name === 'vibrate') {
        kill(Navigator.prototype, 'vibrate');
        kill(navigator, 'vibrate');
      } else if (name === 'orientationLock') {
        if (typeof ScreenOrientation !== 'undefined') kill(ScreenOrientation.prototype, 'lock');
        kill(screen.orientation, 'lock');
      } else if (name === 'clipboard') {
        kill(Navigator.prototype, 'clipboard');
        kill(navigator, 'clipboard');
      }
    }
  }, apis);
}

interface PcgSocket extends WebSocket {
  __pcgHalf?: boolean;
  __pcgDropped?: boolean;
}
interface SocketControl {
  sockets: PcgSocket[];
  drop(): number;
  half(): number;
}
type PcgWindow = Window & { __pcgSockets?: SocketControl };

/**
 * Wraps `window.WebSocket` so the page's sockets are tracked and `dropSockets`/`halfOpenSockets`
 * can misbehave on demand. Install on the context before the page navigates.
 */
export async function installSocketControl(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as PcgWindow;
    if (w.__pcgSockets) return;
    const Native = window.WebSocket;
    const sockets: PcgSocket[] = [];
    type Listener = EventListenerOrEventListenerObject;
    type Marked = Event & { __pcgSynthetic?: boolean };
    const gated = new WeakMap<object, EventListener>();

    // Hides from the page what it must not see on a dropped socket (the real close and anything
    // late) or a half-open one (inbound messages).
    const gate = (sock: PcgSocket, fn: (ev: Event) => void): EventListener => {
      return (ev: Event) => {
        if (sock.__pcgDropped && !(ev as Marked).__pcgSynthetic) return;
        if (sock.__pcgHalf && ev.type === 'message') return;
        fn.call(sock, ev);
      };
    };

    class Tracked extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        const self = this as unknown as PcgSocket;
        sockets.push(self);
        // Registered first, so it sees the real close before anything else: after a drop, that
        // close becomes an abrupt 1006 now that the socket really is closed.
        super.addEventListener('close', (ev) => {
          if (!self.__pcgDropped || (ev as Marked).__pcgSynthetic) return;
          const synthetic: Marked = new CloseEvent('close', {
            code: 1006,
            reason: '',
            wasClean: false,
          });
          synthetic.__pcgSynthetic = true;
          self.dispatchEvent(synthetic);
        });
      }
      override addEventListener(type: string, listener: Listener | null, opts?: unknown): void {
        if (!listener) return;
        const fn: EventListener =
          typeof listener === 'function' ? listener : (ev) => listener.handleEvent(ev);
        const wrapped = gate(this as unknown as PcgSocket, fn);
        gated.set(listener, wrapped);
        super.addEventListener(type, wrapped, opts as AddEventListenerOptions);
      }
      override removeEventListener(type: string, listener: Listener | null, opts?: unknown): void {
        if (!listener) return;
        super.removeEventListener(
          type,
          gated.get(listener) ?? listener,
          opts as EventListenerOptions,
        );
      }
      override send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        const self = this as unknown as PcgSocket;
        if (self.__pcgHalf || self.__pcgDropped) return;
        super.send(data);
      }
    }
    for (const prop of ['onopen', 'onmessage', 'onclose', 'onerror'] as const) {
      const native = Object.getOwnPropertyDescriptor(Native.prototype, prop);
      Object.defineProperty(Tracked.prototype, prop, {
        configurable: true,
        get(this: PcgSocket) {
          return (this as unknown as Record<string, unknown>)[`__${prop}`] ?? null;
        },
        set(this: PcgSocket, fn: ((ev: Event) => void) | null) {
          (this as unknown as Record<string, unknown>)[`__${prop}`] = fn;
          native?.set?.call(this, fn ? gate(this, fn) : null);
        },
      });
    }
    Object.defineProperty(window, 'WebSocket', {
      value: Tracked,
      configurable: true,
      writable: true,
    });
    const live = (s: PcgSocket) => s.readyState <= 1 && !s.__pcgDropped;
    w.__pcgSockets = {
      sockets,
      drop() {
        const open = sockets.filter(live);
        for (const s of open) {
          s.__pcgDropped = true;
          s.close();
        }
        return open.length;
      },
      half() {
        const open = sockets.filter(live);
        for (const s of open) s.__pcgHalf = true;
        return open.length;
      },
    };
  });
}

async function socketAction(page: Page, action: 'drop' | 'half'): Promise<number> {
  return page.evaluate((a) => {
    const control = (window as PcgWindow).__pcgSockets;
    if (!control) throw new Error('installSocketControl(context) must run before the page loads');
    return control[a]();
  }, action);
}

/**
 * Abrupt connection loss: closes each live socket for real and shows the page a `close` event with
 * code 1006, `wasClean: false` (no close frame seen). Returns how many sockets it dropped.
 */
export function dropSockets(page: Page): Promise<number> {
  return socketAction(page, 'drop');
}

/**
 * A silently dead connection: the real sockets stay open (so the relay's protocol-level pongs keep
 * flowing and it never evicts them), but the page receives nothing and its sends vanish. Only the
 * client's own heartbeat can notice. Sockets opened afterwards behave normally.
 */
export function halfOpenSockets(page: Page): Promise<number> {
  return socketAction(page, 'half');
}

/** Overrides `document.visibilityState`/`hidden` and fires `visibilitychange`. */
export async function setVisibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { get: () => s, configurable: true });
    Object.defineProperty(document, 'hidden', { get: () => s === 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

/** Network off/on: `context.setOffline` plus the `offline`/`online` events and `navigator.onLine`. */
export async function setOffline(
  context: BrowserContext,
  page: Page,
  offline: boolean,
): Promise<void> {
  await context.setOffline(offline);
  await page.evaluate((off) => {
    Object.defineProperty(navigator, 'onLine', { get: () => !off, configurable: true });
    window.dispatchEvent(new Event(off ? 'offline' : 'online'));
  }, offline);
}

/**
 * Back/forward-cache restore as iOS Safari does it: `pagehide` (persisted), the sockets die
 * abruptly, then `pageshow` (persisted) on the same page.
 */
export async function simulateBfcacheRestore(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
  });
  await dropSockets(page);
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
}

/** Live list of uncaught page errors and `console.error` calls, for "no unhandled errors" asserts. */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  return errors;
}
