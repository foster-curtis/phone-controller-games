// "Keep your screen on" hint (controller-compat F0 contract, F2 builds it). Where Screen Wake Lock is
// missing (Android WebView browsers such as DuckDuckGo, older Firefox, plain-http LAN pages) or its
// request is refused, the phone's screen can dim and lock mid-game, which suspends the page and drops
// its socket. Shows a small dismissible notice (`.pcg-hint`, not blocking play) once per browser
// (remembered in localStorage), after the first touch has had its chance to take the lock.
// Frozen at controller-compat F0: additive changes only.
import type { StorageLike } from '@pcg/net-client';
import type { WakeLock } from './wakeLock';

export interface KeepAwakeText {
  title: string;
  body: string;
  dismiss: string;
}

export const KEEP_AWAKE_TEXT: Readonly<KeepAwakeText> = {
  title: 'Keep your screen on',
  body: "This browser can't keep your phone awake. Tap the screen now and then, or set a longer auto-lock while you play.",
  dismiss: 'Got it',
};

/** localStorage key that remembers the hint was shown. */
export const KEEP_AWAKE_SEEN_KEY = 'pcg:hint:keepAwake';

export interface KeepAwakeHintOptions {
  host: HTMLElement;
  /** The shell's lock; null = Wake Lock turned off by the game (then the hint never shows). */
  wakeLock: WakeLock | null;
  text?: Partial<KeepAwakeText>;
  /** Default localStorage (failures swallowed: the hint may then show again next visit). */
  storage?: StorageLike;
}

export interface KeepAwakeHint {
  destroy(): void;
}

/** F2 implements. F0 stub: never shows. */
export function createKeepAwakeHint(_opts: KeepAwakeHintOptions): KeepAwakeHint {
  return { destroy() {} };
}
