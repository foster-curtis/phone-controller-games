// Stall stock and views (SPEC §6.5). Stub: TF8 implements them.
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are the owner's.
import type { StallsApi } from './types';

export type { StallsApi } from './types';

export const stalls: StallsApi = {
  stock: () => [],
  view() {
    throw new Error('stalls.view: not implemented (TF8)');
  },
  take() {},
  putBack() {},
};
