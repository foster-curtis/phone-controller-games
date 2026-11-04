// Phone sounds (SPEC §3, §6.8): the shutter click. Silent until SC8 swaps in the Web Audio synth
// behind the same `Sfx` interface.
import { noopSfx, type Sfx } from '../shared/sfx';

export function createPhoneSfx(): Sfx {
  return noopSfx;
}
