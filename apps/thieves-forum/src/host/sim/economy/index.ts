// Economy (SPEC §6.4). Stub: TF13 implements it.
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are the owner's.
import type { StepContext } from '../systems';
import type { EconomyApi } from './types';

export type { EconomyApi } from './types';

export function step(_ctx: StepContext): void {}

export const economy: EconomyApi = {
  roll: (rng, [min, max], skew) => min + (max - min) * rng.next() ** skew,
  pawnOffer() {
    throw new Error('economy.pawnOffer: not implemented (TF13)');
  },
  npcOffer: () => null,
  buy: () => false,
  sell: () => false,
};
