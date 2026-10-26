// Screen Wake Lock (PLATFORM §3). Skipped on insecure origins (LAN http) and where unsupported; never throws.

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
}

export function createWakeLock(
  nav: NavigatorLike | undefined = globalThis.navigator as NavigatorLike | undefined,
  secure: boolean = globalThis.isSecureContext ?? false,
  doc: Pick<Document, 'addEventListener' | 'visibilityState'> | undefined = globalThis.document,
): WakeLock {
  let sentinel: WakeLockSentinelLike | null = null;
  let wanted = false;

  const acquire = async (): Promise<boolean> => {
    if (!secure || !nav?.wakeLock) return false;
    try {
      sentinel = await nav.wakeLock.request('screen');
      sentinel.addEventListener?.('release', () => {
        sentinel = null;
      });
      return true;
    } catch {
      return false;
    }
  };

  // The browser drops the lock when the tab is hidden; take it again on return.
  doc?.addEventListener('visibilitychange', () => {
    if (wanted && doc.visibilityState === 'visible' && !sentinel) void acquire();
  });

  return {
    request() {
      wanted = true;
      return acquire();
    },
    release() {
      wanted = false;
      const s = sentinel;
      sentinel = null;
      void s?.release().catch(() => {});
    },
  };
}
