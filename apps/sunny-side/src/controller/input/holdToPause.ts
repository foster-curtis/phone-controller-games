// Hold-to-pause (SPEC §6.7): a ring fills while held; completing it pauses. Releasing early cancels.

export const HOLD_TO_PAUSE_MS = 600;

export function createHoldToPause(
  el: HTMLElement,
  onPause: () => void,
  holdMs = HOLD_TO_PAUSE_MS,
): { destroy(): void } {
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
      onPause();
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
