// DASH / SLAM hold buttons (multi-touch safe: each tracks its own pointerIds) + the SLAM liquid fill.

export interface HoldButton {
  isDown(): boolean;
  destroy(): void;
}

export function createHoldButton(el: HTMLElement, onChange: (down: boolean) => void): HoldButton {
  const pointers = new Set<number>();
  const down = (e: PointerEvent) => {
    e.preventDefault();
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    const was = pointers.size > 0;
    pointers.add(e.pointerId);
    if (!was) {
      el.classList.add('pressed');
      onChange(true);
    }
  };
  const up = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size === 0) {
      el.classList.remove('pressed');
      onChange(false);
    }
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  return {
    isDown: () => pointers.size > 0,
    destroy() {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    },
  };
}

/** Time to hold SLAM for a full gauge (visual only; the host times the real charge). */
export const SLAM_FULL_MS = 1000;

export interface ChargeFill {
  press(): void;
  release(): void;
  /** 0..1 */
  ratio(): number;
  destroy(): void;
}

/** Fills `fillEl` bottom-to-top (its height, in %) while pressed. */
export function createChargeFill(fillEl: HTMLElement, fullMs = SLAM_FULL_MS): ChargeFill {
  let since: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const ratio = () => (since === null ? 0 : Math.min(1, (Date.now() - since) / fullMs));
  const paint = () => {
    fillEl.style.height = `${Math.round(ratio() * 100)}%`;
  };
  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  paint();
  return {
    press() {
      since = Date.now();
      stop();
      timer = setInterval(paint, 16);
      paint();
    },
    release() {
      since = null;
      stop();
      paint();
    },
    ratio,
    destroy: stop,
  };
}
