// Fullscreen helpers kept for compatibility (PLATFORM §3). The shell no longer asks for full screen on
// tap: players choose it with `createFullscreenButton`. Built on `fullscreenApi` (webkit fallback).
import { fullscreenApi } from '@pcg/game-kit';

/**
 * Requests fullscreen unless already fullscreen. Never throws; rejections are swallowed.
 * @deprecated Use `createFullscreenButton`; automatic full screen on tap is gone.
 */
export function requestFullscreen(doc: Document = document): void {
  try {
    void fullscreenApi(doc).enter();
  } catch {
    /* unsupported or refused */
  }
}

/**
 * Asks for fullscreen on every tap/click inside `target`. Returns an unsubscribe function.
 * @deprecated Use `createFullscreenButton`; automatic full screen on tap is gone.
 */
export function fullscreenOnTap(target: HTMLElement, doc: Document = document): () => void {
  const go = () => requestFullscreen(doc);
  target.addEventListener('pointerup', go);
  target.addEventListener('click', go);
  return () => {
    target.removeEventListener('pointerup', go);
    target.removeEventListener('click', go);
  };
}
