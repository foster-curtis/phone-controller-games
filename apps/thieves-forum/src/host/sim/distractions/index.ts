// Distractions (SPEC §6.9): the handler list, run in order. Stub: TF13 implements coin toss.
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are the owner's.
import type { StepContext } from '../systems';
import type { DistractionHandler } from './types';

export { DISTRACTION_IDS } from './types';
export type { DistractionHandler, DistractionId } from './types';

const coinToss: DistractionHandler = {
  id: 'coinToss',
  canUse: () => false,
  use: () => false,
  step() {},
};

/** Coin toss first (SPEC §9 prep). Append-only. */
export const DISTRACTIONS: readonly DistractionHandler[] = [coinToss];

export function step(ctx: StepContext): void {
  for (const h of DISTRACTIONS) h.step(ctx);
}
