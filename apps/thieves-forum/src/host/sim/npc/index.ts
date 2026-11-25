// NPC crowd (SPEC §6.10, §12.3). Stub: TF2 implements the minds, steering, churn and spawning.
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are the owner's.
import type { StepContext } from '../systems';
import type { NpcApi } from './types';

export type { NpcApi } from './types';

export function step(_ctx: StepContext): void {}

export const npc: NpcApi = {
  createMind() {
    throw new Error('npc.createMind: not implemented (TF2)');
  },
  spawn() {
    throw new Error('npc.spawn: not implemented (TF2)');
  },
};
