// Host visibility pause (SPEC §8): tab hidden → the match pauses (phones show "Paused"); visible →
// it resumes. Reads `visibilityState` on every `visibilitychange`.

export type VisibilityDoc = Pick<
  Document,
  'visibilityState' | 'addEventListener' | 'removeEventListener'
>;

/** Calls `onChange(visible)` now and on every change; returns an unsubscribe. */
export function watchVisibility(
  onChange: (visible: boolean) => void,
  doc: VisibilityDoc = document,
): () => void {
  let last: boolean | null = null;
  const check = () => {
    const visible = doc.visibilityState !== 'hidden';
    if (visible === last) return;
    last = visible;
    onChange(visible);
  };
  doc.addEventListener('visibilitychange', check);
  check();
  return () => doc.removeEventListener('visibilitychange', check);
}
