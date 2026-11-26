// Tip-off viewer (SPEC §6.17 "Tip-off"; BUILD_PLAN TF4 acceptance): a tap on the fitted image outlines
// the nearest suspect, never the tipper's own character; SEND GUARD waits for a pick; Cancel closes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HitArea, TipSnapshot } from '../../../shared/viewer/types';
import { createTipViewer } from '../viewer';

const snapshot: TipSnapshot = { id: 7, w: 960, h: 540, mime: 'image/jpeg', bytes: 40_000 };
const hits: HitArea[] = [
  { targetId: 1, x: 100, y: 100, w: 40, h: 60 },
  { targetId: 2, x: 500, y: 300, w: 40, h: 60 },
  { targetId: 3, x: 700, y: 300, w: 40, h: 60 }, // the tipper's own
];

function setup() {
  const onSend = vi.fn();
  const onCancel = vi.fn();
  const viewer = createTipViewer({
    parent: document.body,
    snapshot,
    hits,
    fee: 10,
    exclude: 3,
    onSend,
    onCancel,
  });
  const stage = viewer.root.querySelector<HTMLElement>('[data-role=stage]')!;
  // A 844 × 390 phone stage less the action column: 640 × 360 shows the snapshot at 2/3 scale.
  stage.getBoundingClientRect = () =>
    ({ left: 10, top: 20, width: 640, height: 360, right: 650, bottom: 380 }) as DOMRect;
  const tap = (sx: number, sy: number) =>
    stage.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 10 + sx, clientY: 20 + sy, bubbles: true }),
    );
  const button = (a: string) => viewer.root.querySelector<HTMLButtonElement>(`[data-action=${a}]`)!;
  return { viewer, tap, button, onSend, onCancel };
}

afterEach(() => document.body.replaceChildren());

describe('createTipViewer', () => {
  it('shows the fee and keeps SEND GUARD off until a suspect is picked', () => {
    const { viewer, button } = setup();
    expect(viewer.root.querySelector('[data-role=fee]')!.textContent).toBe('10 d');
    expect(button('send').disabled).toBe(true);
    expect(viewer.root.dataset.loaded).toBeUndefined();
    viewer.setImage('blob:x');
    expect(viewer.root.querySelector('img')!.getAttribute('src')).toBe('blob:x');
    expect(viewer.root.dataset.loaded).toBe('true');
  });

  it('a tap maps through the fit and outlines the nearest hit area', () => {
    const { viewer, tap, button, onSend } = setup();
    // Snapshot (120, 130) is inside hit 1; on screen that is × 2/3.
    tap(120 * (2 / 3), 130 * (2 / 3));
    expect(viewer.selected()).toBe(1);
    expect(viewer.root.dataset.selected).toBe('1');
    const outline = viewer.root.querySelector('[data-role=outline]')!;
    expect(outline.getAttribute('visibility')).toBe('visible');
    expect(outline.getAttribute('x')).toBe('100');
    expect(outline.getAttribute('height')).toBe('60');
    // Just left of hit 2: still picks it (within the slop).
    tap(490 * (2 / 3), 320 * (2 / 3));
    expect(viewer.selected()).toBe(2);
    expect(button('send').disabled).toBe(false);
    button('send').click();
    expect(onSend).toHaveBeenCalledWith(2);
  });

  it('never selects the tipper, and a miss keeps the current pick', () => {
    const { viewer, tap } = setup();
    tap(720 * (2 / 3), 330 * (2 / 3));
    expect(viewer.selected()).toBeNull();
    expect(viewer.tapAt(510, 320)).toBe(2);
    expect(viewer.tapAt(720, 330)).toBeNull();
    expect(viewer.tapAt(900, 20)).toBeNull();
    expect(viewer.selected()).toBe(2);
  });

  it('Cancel calls back; destroy removes the sheet', () => {
    const { viewer, button, onCancel } = setup();
    button('cancel').click();
    expect(onCancel).toHaveBeenCalledOnce();
    viewer.destroy();
    expect(document.querySelector('[data-screen=tipoff]')).toBeNull();
  });
});
