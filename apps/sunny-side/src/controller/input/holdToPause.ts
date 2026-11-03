// Hold-to-pause (SPEC §6.7): the kit's hold-to-confirm; a ring fills while held, completing it pauses.
import { createHoldToConfirm } from '@pcg/controller-kit';

export const HOLD_TO_PAUSE_MS = 600;

export function createHoldToPause(
  el: HTMLElement,
  onPause: () => void,
  holdMs = HOLD_TO_PAUSE_MS,
): { destroy(): void } {
  return createHoldToConfirm(el, onPause, { holdMs });
}
