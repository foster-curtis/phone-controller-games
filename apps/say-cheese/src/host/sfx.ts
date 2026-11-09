// TV sounds (SPEC §6.8): countdown beeps, start/end buzz, shutter, develop, results sting, from the
// shared Web Audio synth. Browsers block audio until a gesture, so the lobby's "Sound on" button and
// any click or key on the host page unlock it (BUILD_PLAN §3 SC8).
import { debugEnabled } from '@pcg/game-kit';
import { createSfx } from '../shared/audio/synth';
import type { Sfx } from '../shared/sfx';

export function createHostSfx(): Sfx {
  const sfx = createSfx();
  if (typeof document !== 'undefined') {
    const unlock = () => {
      void sfx.unlock().then(() => {
        if (sfx.unlocked) {
          document.removeEventListener('click', unlock, true);
          document.removeEventListener('keydown', unlock, true);
        }
      });
    };
    document.addEventListener('click', unlock, true);
    document.addEventListener('keydown', unlock, true);
  }
  exposeUnlocked(sfx);
  return sfx;
}

/**
 * e2e hook `window.__pcg.sfxUnlocked()`. debug.ts isn't SC8's file and assigns `window.__pcg` after
 * this runs, so an accessor adds the method to whatever object lands there (BUILD_PLAN §8).
 */
function exposeUnlocked(sfx: Sfx): void {
  if (typeof window === 'undefined' || !debugEnabled(import.meta.env.DEV)) return;
  let hooks: Record<string, unknown> | undefined;
  Object.defineProperty(window, '__pcg', {
    configurable: true,
    get: () => hooks,
    set: (v: Record<string, unknown>) => {
      hooks = v;
      if (v && typeof v === 'object') v.sfxUnlocked = () => sfx.unlocked;
    },
  });
}
