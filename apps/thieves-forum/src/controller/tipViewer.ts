// The tip-off viewer seam (SPEC §6.13, §6.17, §12.6). TF4's `createTipViewer` (src/controller/tipoff/)
// plugs in through `TipViewerFactory` at wiring time (TF7/TF12/TF14); until then this dev-only viewer
// shows a placeholder frame with one tappable box per hit area, so the tip-off screen is complete.
// Never imports host code.
import type { Chunk } from '../shared/blob-transfer/types';
import type { HitArea, TipSnapshot } from '../shared/viewer/types';
import { el } from './ui';

export interface TipViewer {
  el: HTMLElement;
  /** Blob chunks of this snapshot, forwarded from the host connection (real viewer only). */
  feed?(chunk: Chunk): void;
  destroy(): void;
}

export interface TipViewerOptions {
  snapshot: TipSnapshot;
  hits: HitArea[];
  /** The selected `targetId`, or null when the tap hit nothing. */
  onSelect(target: number | null): void;
}

export type TipViewerFactory = (opts: TipViewerOptions) => TipViewer;

/** Placeholder viewer: hit areas drawn as boxes over a blank frame. */
export const devTipViewer: TipViewerFactory = ({ snapshot, hits, onSelect }) => {
  const frame = el('div', { class: 'tip-frame', 'data-tip-viewer': 'dev' });
  frame.style.aspectRatio = `${snapshot.w} / ${snapshot.h}`;
  for (const h of hits) {
    const box = el('button', {
      type: 'button',
      class: 'tip-hit',
      'data-target': String(h.targetId),
    });
    box.style.left = `${(h.x / snapshot.w) * 100}%`;
    box.style.top = `${(h.y / snapshot.h) * 100}%`;
    box.style.width = `${(h.w / snapshot.w) * 100}%`;
    box.style.height = `${(h.h / snapshot.h) * 100}%`;
    box.addEventListener('click', () => {
      for (const o of frame.querySelectorAll('.tip-hit.selected')) o.classList.remove('selected');
      box.classList.add('selected');
      onSelect(h.targetId);
    });
    frame.append(box);
  }
  return { el: frame, destroy: () => frame.remove() };
};
