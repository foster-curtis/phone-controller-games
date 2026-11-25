// Tip-offs (SPEC §6.13). Stub: TF14 implements them.
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are the owner's.
import type { TipoffApi } from './types';

export type { TipoffApi, TipOutcome } from './types';

export const tipoff: TipoffApi = {
  open() {},
  send: () => 'missed',
  cancel() {},
  judge: () => false,
};
