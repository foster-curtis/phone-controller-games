// Landscape handling (SPEC §7.2). iOS Safari cannot lock orientation, so portrait shows a rotate overlay.

export function isPortrait(win: Pick<Window, 'innerWidth' | 'innerHeight'> = window): boolean {
  return win.innerHeight > win.innerWidth;
}

/** Calls `cb(portrait)` now and on every resize / orientation change. Returns an unsubscribe. */
export function watchOrientation(
  cb: (portrait: boolean) => void,
  win: Window = window,
): () => void {
  const check = () => cb(isPortrait(win));
  win.addEventListener('resize', check);
  win.addEventListener('orientationchange', check);
  check();
  return () => {
    win.removeEventListener('resize', check);
    win.removeEventListener('orientationchange', check);
  };
}

/**
 * Best effort: fullscreen + landscape lock (Android Chrome). Needs a user gesture and a secure
 * context; skipped otherwise. Never throws.
 */
export async function tryLockLandscape(
  win: Window = window,
  doc: Document = document,
): Promise<boolean> {
  if (!win.isSecureContext) return false;
  try {
    if (!doc.fullscreenElement) await doc.documentElement.requestFullscreen?.();
    const orientation = win.screen?.orientation as
      (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
    if (!orientation?.lock) return false;
    await orientation.lock('landscape');
    return true;
  } catch {
    return false;
  }
}
