// Hold button (multi-touch safe: each tracks its own pointerIds). `.pressed` while held.

export interface HoldButton {
  isDown(): boolean;
  /** Start / end a press from a pointer event that landed elsewhere (see createNearestRouter). */
  press(e: PointerEvent): void;
  release(e: PointerEvent): void;
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
    press: down,
    release: up,
    destroy() {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    },
  };
}
