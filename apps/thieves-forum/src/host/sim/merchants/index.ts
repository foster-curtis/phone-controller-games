// Merchants (SPEC §6.6). Stub: TF8 implements them.
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are the owner's.
import type { StepContext } from '../systems';
import type { MerchantsApi } from './types';

export type { MerchantsApi } from './types';

export function step(_ctx: StepContext): void {}

export const merchants: MerchantsApi = {
  callAway() {},
  isAway: (m) => m.spot === 'away',
  suspect() {},
};
