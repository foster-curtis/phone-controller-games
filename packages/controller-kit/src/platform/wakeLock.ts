// Phone Screen Wake Lock (PLATFORM §3). Skipped on insecure origins (LAN http) and where unsupported; never throws.

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener?(type: 'release', cb: () => void): void;
}
interface NavigatorLike {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
}

export interface WakeLock {
  /** Resolves true when a lock is held. */
  request(): Promise<boolean>;
  release(): void;
  /** Secure context and `navigator.wakeLock` present. */
  readonly supported: boolean;
  /** A lock is held right now. */
  readonly held: boolean;
}

export function createWakeLock(
  nav: NavigatorLike | undefined = globalThis.navigator as NavigatorLike | undefined,
  secure: boolean = globalThis.isSecureContext ?? false,
  doc: Pick<Document, 'addEventListener' | 'visibilityState'> | undefined = globalThis.document,
  win: Pick<Window, 'addEventListener'> | undefined = globalThis.window,
): WakeLock {
  let sentinel: WakeLockSentinelLike | null = null;
  let wanted = false;
  let pending: Promise<boolean> | null = null;

  const supported = (): boolean => {
    try {
      return !!secure && !!nav?.wakeLock && typeof nav.wakeLock.request === 'function';
    } catch {
      return false;
    }
  };

  const acquire = (): Promise<boolean> => {
    if (sentinel) return Promise.resolve(true);
    if (pending) return pending; // coalesce: one request in flight
    if (!supported()) return Promise.resolve(false);
    pending = (async () => {
      try {
        const s = await nav!.wakeLock!.request('screen');
        if (!wanted) {
          // Released while the request was in flight.
          void Promise.resolve(s.release()).catch(() => {});
          return false;
        }
        sentinel = s;
        s.addEventListener?.('release', () => {
          if (sentinel === s) sentinel = null;
        });
        return true;
      } catch {
        return false;
      } finally {
        pending = null;
      }
    })();
    return pending;
  };

  // The browser drops the lock when the tab is hidden; take it again on return.
  const retake = () => {
    try {
      if (wanted && !sentinel && (doc?.visibilityState ?? 'visible') === 'visible') void acquire();
    } catch {
      /* never throws */
    }
  };
  try {
    doc?.addEventListener('visibilitychange', retake);
    win?.addEventListener('pageshow', retake);
    win?.addEventListener('focus', retake);
  } catch {
    /* ignore */
  }

  return {
    get supported() {
      return supported();
    },
    get held() {
      return sentinel !== null;
    },
    request() {
      wanted = true;
      return acquire();
    },
    release() {
      wanted = false;
      const s = sentinel;
      sentinel = null;
      try {
        void Promise.resolve(s?.release()).catch(() => {});
      } catch {
        /* ignore */
      }
    },
  };
}
