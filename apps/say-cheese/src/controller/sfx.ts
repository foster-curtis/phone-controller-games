// Phone sounds (SPEC §3, §6.8): the shutter click, from the shared Web Audio synth. Unlocked by the
// photographer's I'm ready tap (screens/round.ts); the TV plays every sound too, so this is a bonus.
import { createSfx } from '../shared/audio/synth';
import type { Sfx } from '../shared/sfx';

export function createPhoneSfx(): Sfx {
  return createSfx({ volume: 0.9 });
}
