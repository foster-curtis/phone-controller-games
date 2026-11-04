// TV sounds (SPEC §6.8): countdown beeps, start/end buzz, shutter, develop, results sting. Silent
// until SC8 swaps in the Web Audio synth behind the same `Sfx` interface.
import { noopSfx, type Sfx } from '../shared/sfx';

export function createHostSfx(): Sfx {
  return noopSfx;
}
