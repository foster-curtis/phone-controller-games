/** Dispatches a pointer event (jsdom's PointerEvent support varies, so fall back to a MouseEvent). */
export function pointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  pointerId: number,
  x = 0,
  y = 0,
): void {
  const init = { bubbles: true, cancelable: true, clientX: x, clientY: y };
  const ev =
    typeof PointerEvent === 'function'
      ? new PointerEvent(type, { ...init, pointerId })
      : Object.assign(new MouseEvent(type, init), { pointerId });
  target.dispatchEvent(ev);
}

/** Pins an element's layout box (jsdom has no layout). */
export function setRect(el: Element, x: number, y: number, w: number, h: number): void {
  el.getBoundingClientRect = () =>
    ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y }) as DOMRect;
}
