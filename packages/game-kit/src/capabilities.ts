// Feature detection for phone and TV pages (PLATFORM §3; controller-compat F0). Shared by both kits:
// @pcg/controller-kit (phone) and the host's full-screen button here. Detects features, never the
// user agent. Never throws, and reads globals only when called, so importing it in Node is safe.
// Frozen at controller-compat F0: additive changes only.

type FsElement = Element & {
  requestFullscreen?: (opts?: FullscreenOptions) => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type FsDocument = Pick<Document, 'addEventListener' | 'removeEventListener'> & {
  documentElement?: Element;
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => Promise<void> | void;
};

/** What `detectCapabilities` reads; every field defaults to the matching global. */
export interface CapabilityEnv {
  window?: {
    isSecureContext?: boolean;
    matchMedia?: (query: string) => { matches: boolean };
    screen?: { orientation?: { lock?: unknown } };
    DeviceOrientationEvent?: unknown;
  };
  document?: unknown;
  navigator?: {
    wakeLock?: { request?: unknown };
    vibrate?: unknown;
    clipboard?: { writeText?: unknown };
    /** iOS home-screen web apps only. */
    standalone?: boolean;
  };
}

export interface Capabilities {
  /** HTTPS or localhost. Wake Lock, clipboard and motion sensors need it. */
  secureContext: boolean;
  /** Screen Wake Lock can be requested (API present and secure context). */
  wakeLock: boolean;
  /** Page elements can go full screen (standard or `webkit` API, and not disabled). */
  fullscreen: boolean;
  vibrate: boolean;
  /** `screen.orientation.lock` exists (it still needs full screen on most phones). */
  orientationLock: boolean;
  /** Motion sensors: `prompt` = needs `requestPermission()` from a tap (iOS). */
  motion: 'granted-by-default' | 'prompt' | 'unsupported';
  /** Launched as an installed web app (`display-mode: fullscreen | standalone`, or iOS home screen). */
  standalone: boolean;
  /** `navigator.clipboard.writeText` exists (and secure context). */
  clipboard: boolean;
}

/** Snapshot of what this browser supports. Cheap; call again after a change of state. */
export function detectCapabilities(env: CapabilityEnv = defaultEnv()): Capabilities {
  const win = env.window;
  const nav = env.navigator;
  const secureContext = safe(() => win?.isSecureContext === true, false);
  const motionCtor = safe(() => win?.DeviceOrientationEvent, undefined) as
    { requestPermission?: unknown } | undefined;
  return {
    secureContext,
    wakeLock: secureContext && safe(() => typeof nav?.wakeLock?.request === 'function', false),
    fullscreen: fullscreenApi(env.document as Document | undefined).supported,
    vibrate: safe(() => typeof nav?.vibrate === 'function', false),
    orientationLock: safe(() => typeof win?.screen?.orientation?.lock === 'function', false),
    motion: !motionCtor
      ? 'unsupported'
      : typeof motionCtor.requestPermission === 'function'
        ? 'prompt'
        : 'granted-by-default',
    standalone: isStandalone(env),
    clipboard: secureContext && safe(() => typeof nav?.clipboard?.writeText === 'function', false),
  };
}

/** Running as an installed web app: `display-mode` fullscreen or standalone, or iOS's `navigator.standalone`. */
export function isStandalone(env: CapabilityEnv = defaultEnv()): boolean {
  return safe(() => {
    if (env.navigator?.standalone === true) return true;
    const mm = env.window?.matchMedia;
    if (typeof mm !== 'function') return false;
    return (
      mm.call(env.window, '(display-mode: fullscreen)').matches ||
      mm.call(env.window, '(display-mode: standalone)').matches
    );
  }, false);
}

/** Element full screen with the `webkit` fallback (Safari on iPad and Mac). Never throws or rejects. */
export interface FullscreenApi {
  /** Page elements can go full screen here. False on iPhone (every iOS browser) and in WebViews that disable it. */
  readonly supported: boolean;
  /** Something is full screen now. */
  isActive(): boolean;
  /** Must run inside a user gesture (click, tap, key press). Resolves false if unsupported or refused. */
  enter(target?: Element): Promise<boolean>;
  /** Resolves false if nothing was full screen or the browser refused. */
  exit(): Promise<boolean>;
  /** `cb(isActive())` on every change (standard and `webkit` events). Returns an unsubscribe. */
  onChange(cb: (active: boolean) => void): () => void;
}

export function fullscreenApi(
  doc: Document | undefined = globalThis.document as Document | undefined,
): FullscreenApi {
  const d = doc as unknown as FsDocument | undefined;
  const root = safe(() => d?.documentElement as FsElement | undefined, undefined);
  const supported = safe(() => {
    if (!d || !root) return false;
    const hasRequest =
      typeof root.requestFullscreen === 'function' ||
      typeof root.webkitRequestFullscreen === 'function';
    const enabled = d.fullscreenEnabled ?? d.webkitFullscreenEnabled;
    return hasRequest && enabled !== false;
  }, false);
  const isActive = () => safe(() => !!(d?.fullscreenElement ?? d?.webkitFullscreenElement), false);

  return {
    supported,
    isActive,
    async enter(target) {
      if (!supported || isActive()) return isActive();
      const el = (target ?? root) as FsElement | undefined;
      try {
        if (typeof el?.requestFullscreen === 'function') {
          await el.requestFullscreen({ navigationUI: 'hide' });
        } else if (typeof el?.webkitRequestFullscreen === 'function') {
          await el.webkitRequestFullscreen();
        } else {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    },
    async exit() {
      if (!isActive()) return false;
      try {
        if (typeof d?.exitFullscreen === 'function') await d.exitFullscreen();
        else if (typeof d?.webkitExitFullscreen === 'function') await d.webkitExitFullscreen();
        else return false;
        return true;
      } catch {
        return false;
      }
    },
    onChange(cb) {
      if (!d) return () => {};
      const fire = () => cb(isActive());
      d.addEventListener('fullscreenchange', fire);
      d.addEventListener('webkitfullscreenchange', fire);
      return () => {
        d.removeEventListener('fullscreenchange', fire);
        d.removeEventListener('webkitfullscreenchange', fire);
      };
    },
  };
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function defaultEnv(): CapabilityEnv {
  const g = globalThis as unknown as {
    window?: CapabilityEnv['window'];
    document?: unknown;
    navigator?: CapabilityEnv['navigator'];
  };
  return { window: g.window, document: g.document, navigator: g.navigator };
}
