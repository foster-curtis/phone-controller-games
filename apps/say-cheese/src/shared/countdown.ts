// Scatter countdown beeps (SPEC §6.2 step 2, §6.8): one sound per whole second left, `beep` at 5…2 and
// `beepFinal` at 1, on the TV and on the photographer's dark phone (eyes closed, BUILD_PLAN §8).
import type { SfxName } from './sfx';

/** The first second that beeps (the scatter is 5 s, so every second does). */
export const COUNTDOWN_BEEP_FROM = 5;

/** The sound for `secondsLeft` whole seconds left on the countdown, or null for none. */
export function countdownBeep(secondsLeft: number): SfxName | null {
  if (!Number.isInteger(secondsLeft) || secondsLeft < 1 || secondsLeft > COUNTDOWN_BEEP_FROM) {
    return null;
  }
  return secondsLeft === 1 ? 'beepFinal' : 'beep';
}

export interface CountdownBeeper {
  /** Called on every repaint/tick with the ms left: beeps once when a new whole second shows. */
  tick(msLeft: number): void;
  /** The countdown is over (or a new one starts): the next `tick` beeps again. */
  reset(): void;
}

/** Turns countdown ticks into one `play` per whole second shown (`Math.ceil`, as the display). */
export function createCountdownBeeper(play: (name: SfxName) => void): CountdownBeeper {
  let last = 0;
  return {
    tick(msLeft) {
      const s = Math.max(0, Math.ceil(msLeft / 1000));
      if (s === last) return;
      last = s;
      const name = countdownBeep(s);
      if (name) play(name);
    },
    reset() {
      last = 0;
    },
  };
}
