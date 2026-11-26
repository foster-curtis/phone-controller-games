// Tip-off viewer (SPEC §6.13, §6.17 "Tip-off", §12.6): the still snapshot of the market fitted to the
// landscape screen, a tap outlines the nearest suspect (never the tipper's own character), the fee,
// SEND GUARD and Cancel. The header and hit areas arrive first; the image follows by blob transfer
// (`setImage`). Used by the TF4 spike and by the play screen in TF14. Never imports host code.
import './tipoff.css';
import { fitContain, nearestHit, TAP_SLOP_PX } from '../../shared/viewer/hits';
import type { HitArea, TipSnapshot } from '../../shared/viewer/types';

const SVG = 'http://www.w3.org/2000/svg';

export interface TipViewerOptions {
  parent: HTMLElement;
  snapshot: TipSnapshot;
  hits: readonly HitArea[];
  /** Tip fee in denarii, shown beside SEND GUARD. */
  fee: number;
  /** The tipper's own character, if the host sent its hit area anyway: never selectable. */
  exclude?: number;
  /** Image URL, when the blob is already here. */
  url?: string;
  onSend(targetId: number): void;
  onCancel(): void;
}

export interface TipViewer {
  readonly root: HTMLElement;
  /** The blob arrived: show it. */
  setImage(url: string): void;
  /** The outlined suspect's `targetId`, or null. */
  selected(): number | null;
  /** Selects the hit area nearest snapshot pixel (`px`, `py`), as a tap there would. */
  tapAt(px: number, py: number): number | null;
  destroy(): void;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createTipViewer(opts: TipViewerOptions): TipViewer {
  const { snapshot, hits } = opts;
  const root = h('section', 'tipoff');
  root.dataset.screen = 'tipoff';

  const stage = h('div', 'tipoff-stage');
  stage.dataset.role = 'stage';
  const img = h('img', 'tipoff-img');
  img.dataset.role = 'snapshot';
  img.alt = 'The market a moment ago';
  img.draggable = false;
  const loading = h('p', 'caption tipoff-loading', 'Loading snapshot…');

  // Same box and the same contain fit as the image, so outlines sit on the characters.
  const overlay = document.createElementNS(SVG, 'svg');
  overlay.setAttribute('class', 'tipoff-overlay');
  overlay.setAttribute('viewBox', `0 0 ${snapshot.w} ${snapshot.h}`);
  overlay.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const outline = document.createElementNS(SVG, 'rect');
  outline.setAttribute('class', 'tipoff-outline');
  outline.dataset.role = 'outline';
  outline.setAttribute('visibility', 'hidden');
  overlay.append(outline);
  stage.append(img, overlay, loading);

  const bar = h('div', 'tipoff-bar');
  const hint = h('p', 'label tipoff-hint', 'Tap a suspect');
  const fee = h('p', 'money tipoff-fee', `${opts.fee} d`);
  fee.dataset.role = 'fee';
  const send = h('button', 'button tipoff-send coin-edge', 'Send guard');
  send.type = 'button';
  send.dataset.action = 'send';
  send.disabled = true;
  const cancel = h('button', 'button tipoff-cancel', 'Cancel');
  cancel.type = 'button';
  cancel.dataset.action = 'cancel';
  bar.append(hint, fee, send, cancel);

  root.append(stage, bar);
  opts.parent.append(root);

  let selected: HitArea | null = null;

  function select(hit: HitArea | null): void {
    selected = hit;
    send.disabled = hit === null;
    if (hit) {
      outline.setAttribute('x', String(hit.x));
      outline.setAttribute('y', String(hit.y));
      outline.setAttribute('width', String(hit.w));
      outline.setAttribute('height', String(hit.h));
      outline.setAttribute('visibility', 'visible');
      root.dataset.selected = String(hit.targetId);
    } else {
      outline.setAttribute('visibility', 'hidden');
      delete root.dataset.selected;
    }
  }

  function tapAt(px: number, py: number): number | null {
    const hit = nearestHit(hits, px, py, opts.exclude, TAP_SLOP_PX);
    // A tap on empty market keeps the current choice (a near miss shouldn't undo a pick).
    if (hit) select(hit);
    return hit?.targetId ?? null;
  }

  const onPointer = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    const fit = fitContain(snapshot.w, snapshot.h, r.width, r.height);
    if (fit.scale <= 0) return;
    tapAt((e.clientX - r.left - fit.x) / fit.scale, (e.clientY - r.top - fit.y) / fit.scale);
  };
  stage.addEventListener('pointerdown', onPointer);
  send.addEventListener('click', () => {
    if (selected) opts.onSend(selected.targetId);
  });
  cancel.addEventListener('click', () => opts.onCancel());

  function setImage(url: string): void {
    img.src = url;
    loading.hidden = true;
    root.dataset.loaded = 'true';
  }
  if (opts.url) setImage(opts.url);

  return {
    root,
    setImage,
    selected: () => selected?.targetId ?? null,
    tapAt,
    destroy() {
      stage.removeEventListener('pointerdown', onPointer);
      root.remove();
    },
  };
}
