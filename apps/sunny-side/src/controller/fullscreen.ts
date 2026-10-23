// Fullscreen on phones that support it (no secure context needed, unlike Wake Lock). Must run inside a
// user gesture. iPhone Safari has no element fullscreen: everything here is then a silent no-op.

type FsElement = HTMLElement & {
  requestFullscreen?: (opts?: FullscreenOptions) => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type FsDocument = Document & { webkitFullscreenElement?: Element | null };

/** Requests fullscreen unless already fullscreen. Never throws; rejections are swallowed. */
export function requestFullscreen(doc: Document = document): void {
  try {
    const d = doc as FsDocument;
    if (d.fullscreenElement || d.webkitFullscreenElement) return;
    const root = doc.documentElement as FsElement;
    let result: Promise<void> | void | undefined;
    if (typeof root.requestFullscreen === 'function') {
      result = root.requestFullscreen({ navigationUI: 'hide' });
    } else if (typeof root.webkitRequestFullscreen === 'function') {
      result = root.webkitRequestFullscreen();
    }
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch(() => {});
    }
  } catch {
    /* unsupported or refused */
  }
}

/**
 * Asks for fullscreen on every tap/click inside `target` (the Join / Ready tap, and again after the
 * user left fullscreen). Returns an unsubscribe function.
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
