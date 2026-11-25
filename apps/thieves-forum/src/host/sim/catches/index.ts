// Catches (SPEC §6.13). Stub: TF9 implements them.
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are the owner's.
import type { StepContext } from '../systems';
import type { CatchesApi } from './types';

export type { CatchesApi, CatchKind } from './types';

export function step(_ctx: StepContext): void {}

export const catches: CatchesApi = {
  inPerson() {},
  byGuard() {},
  catchable: () => false,
};
