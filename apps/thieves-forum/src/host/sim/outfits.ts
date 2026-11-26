// The one outfit draw for everybody (SPEC §6.11, §12.3 disguise invariants, §12.4): players and NPCs
// take a fresh outfit from the same pool through this function and the round's `outfits` stream, so no
// piece or combination says "player". Callable mid-round (SPEC §9 outfit-stall prep).
import type { AssignOutfit } from './lifecycle/types';

export const assignOutfit: AssignOutfit = (rng, pool) => ({
  tunic: rng.pick(pool.tunics),
  mantle: rng.pick(pool.mantles),
  hair: rng.int(0, pool.hairTones - 1),
  skin: rng.int(0, pool.skinTones - 1),
});

/** The stream label every outfit is drawn from (SPEC §12.3). */
export const OUTFIT_STREAM = 'outfits';
