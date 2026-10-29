// DOM adapter for the gesture machines: one pointer at a time per element; pointer offsets from the
// down point feed `move`/`up`, and a timer delivers `tick` at the machine's next deadline.
import type { GestureMachine } from './types';

export interface GestureBinding<S> {
  state(): S;
  /** Drops the current gesture (no outputs), e.g. when the screen changes under the thumb. */
  reset(): void;
  destroy(): void;
}

export interface BindGestureOptions<S, O> {
  /** Each output, with the state after the input that produced it. */
  onOutput(out: O, state: S): void;
  /** Every state change (drive aim/radial flags and visuals from here). */
  onState?(state: S): void;
  /** Clock, ms (default Date.now). */
  now?: () => number;
}

export function bindGesture<S, O>(
  el: HTMLElement,
  machine: GestureMachine<S, O>,
  opts: BindGestureOptions<S, O>,
): GestureBinding<S> {
  const now = opts.now ?? (() => Date.now());
  let state = machine.initial();
  let pointerId: number | null = null;
  let ox = 0;
  let oy = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const due = machine.deadline(state);
    if (due === null) return;
    timer = setTimeout(
      () => feed({ type: 'tick', t: Math.max(due, now()) }),
      Math.max(0, due - now()),
    );
  };

  const feed = (input: Parameters<GestureMachine<S, O>['step']>[1]) => {
    const prev = state;
    const r = machine.step(state, input);
    state = r.state;
    if (state !== prev) opts.onState?.(state);
    for (const o of r.out) opts.onOutput(o, state);
    schedule();
  };

  const down = (e: PointerEvent) => {
    if (pointerId !== null) return;
    e.preventDefault();
    pointerId = e.pointerId;
    ox = e.clientX;
    oy = e.clientY;
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    el.classList.add('pressed');
    feed({ type: 'down', t: now() });
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    feed({ type: 'move', t: now(), dx: e.clientX - ox, dy: e.clientY - oy });
  };
  const end = (e: PointerEvent, type: 'up' | 'cancel') => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    el.classList.remove('pressed');
    if (type === 'up') feed({ type, t: now(), dx: e.clientX - ox, dy: e.clientY - oy });
    else feed({ type, t: now() });
  };
  const up = (e: PointerEvent) => end(e, 'up');
  const cancel = (e: PointerEvent) => end(e, 'cancel');

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);

  const reset = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pointerId = null;
    el.classList.remove('pressed');
    const prev = state;
    state = machine.initial();
    if (state !== prev) opts.onState?.(state);
  };

  return {
    state: () => state,
    reset,
    destroy() {
      reset();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
    },
  };
}
