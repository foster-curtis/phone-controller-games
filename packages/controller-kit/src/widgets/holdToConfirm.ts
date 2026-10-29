// Hold-to-confirm: a ring fills while held (`--progress` 0..1, `.holding`); completing it confirms and
// releasing early cancels. Sunny Side's hold-to-pause and Fort Frenzy's shop (0.6 s) use it.

export const HOLD_TO_CONFIRM_MS = 600;

export interface HoldToConfirmOptions {
  /** Hold time, ms (default 600). */
  holdMs?: number;
}

export function createHoldToConfirm(
  el: HTMLElement,
  onConfirm: () => void,
  opts: HoldToConfirmOptions = {},
): { destroy(): void } {
  const holdMs = opts.holdMs ?? HOLD_TO_CONFIRM_MS;
  let pointerId: number | null = null;
  let started = 0;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let tick: ReturnType<typeof setInterval> | null = null;

  const paint = (p: number) => el.style.setProperty('--progress', String(p));
  const cancel = () => {
    if (timeout !== null) clearTimeout(timeout);
    if (tick !== null) clearInterval(tick);
    timeout = tick = null;
    pointerId = null;
    el.classList.remove('holding');
    paint(0);
  };
  const down = (e: PointerEvent) => {
    if (pointerId !== null) return;
    e.preventDefault();
    pointerId = e.pointerId;
    started = Date.now();
    el.classList.add('holding');
    tick = setInterval(() => paint(Math.min(1, (Date.now() - started) / holdMs)), 16);
    timeout = setTimeout(() => {
      cancel();
      onConfirm();
    }, holdMs);
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId === pointerId) cancel();
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  paint(0);
  return {
    destroy() {
      cancel();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    },
  };
}
