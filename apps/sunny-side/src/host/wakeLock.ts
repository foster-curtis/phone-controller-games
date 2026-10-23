// Host Screen Wake Lock (SPEC §8): keep the TV/laptop awake. Feature-detected; insecure origins
// (LAN http) have no `navigator.wakeLock`, so this is a silent no-op there. The browser drops the
// lock whenever the tab is hidden, so it is re-requested on every return to visible.

interface WakeLockSentinelLike {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', cb: () => void): void;
}

export interface WakeLockEnv {
  navigator?: { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } };
  document?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  /** Receives the first-gesture listeners (some browsers want a user activation). */
  window?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

export interface HostWakeLock {
  readonly supported: boolean;
  readonly held: boolean;
  request(): Promise<boolean>;
  dispose(): void;
}

export function createHostWakeLock(env: WakeLockEnv = defaultEnv()): HostWakeLock {
  const api = env.navigator?.wakeLock;
  let sentinel: WakeLockSentinelLike | null = null;
  let pending = false;

  const request = async (): Promise<boolean> => {
    if (!api || pending || (sentinel && !sentinel.released)) return !!sentinel;
    if (env.document && env.document.visibilityState !== 'visible') return false;
    pending = true;
    try {
      const s = await api.request('screen');
      sentinel = s;
      s.addEventListener('release', () => {
        if (sentinel === s) sentinel = null;
      });
      return true;
    } catch {
      return false;
    } finally {
      pending = false;
    }
  };

  const onVisibility = () => {
    if (env.document?.visibilityState === 'visible') void request();
  };
  const onGesture = () => void request();

  if (api) {
    env.document?.addEventListener('visibilitychange', onVisibility);
    env.window?.addEventListener('pointerdown', onGesture);
    env.window?.addEventListener('keydown', onGesture);
  }

  return {
    supported: !!api,
    get held() {
      return !!sentinel && !sentinel.released;
    },
    request,
    dispose() {
      env.document?.removeEventListener('visibilitychange', onVisibility);
      env.window?.removeEventListener('pointerdown', onGesture);
      env.window?.removeEventListener('keydown', onGesture);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    },
  };
}

function defaultEnv(): WakeLockEnv {
  return {
    navigator: globalThis.navigator as WakeLockEnv['navigator'],
    document: globalThis.document,
    window: globalThis.window,
  };
}
