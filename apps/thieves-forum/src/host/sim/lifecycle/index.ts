// Lifecycle (SPEC §6.10, §6.18). Stub: TF2 (outfits, crowd) and TF16 (joins, takeover, leave).
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are the owner's.
import type { StepContext } from '../systems';
import type { AssignOutfit } from './types';

export type { AssignOutfit, CrowdBand } from './types';

export const assignOutfit: AssignOutfit = () => {
  throw new Error('assignOutfit: not implemented (TF2)');
};

export function step(_ctx: StepContext): void {}
