// Guards (SPEC §6.12). Stub: TF9 implements them.
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are the owner's.
import type { StepContext } from '../systems';
import type { GuardsApi } from './types';

export type { GuardsApi } from './types';

export function step(_ctx: StepContext): void {}

export const guards: GuardsApi = {
  raiseAlert() {},
  collect() {},
  startingGuards() {
    throw new Error('guards.startingGuards: not implemented (TF9)');
  },
};
