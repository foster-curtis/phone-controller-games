// Host hold machine (SPEC §3, §12.3). Stub: TF3 implements it.
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are the owner's.
import type { StepContext } from '../systems';
import type { HoldsApi } from './types';

export type { HoldsApi } from './types';

export function step(_ctx: StepContext): void {}

export const holds: HoldsApi = {
  start: () => null,
  end() {},
  activeFor: () => null,
  isMidSteal: () => false,
};
