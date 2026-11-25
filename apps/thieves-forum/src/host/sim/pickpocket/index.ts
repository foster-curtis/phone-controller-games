// Pickpocketing (SPEC §6.8). Stub: TF14 implements it.
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are the owner's.
import type { StepContext } from '../systems';
import type { PickpocketApi } from './types';

export type { PickpocketApi } from './types';

export function step(_ctx: StepContext): void {}

export const pickpocket: PickpocketApi = {
  targetFor: () => null,
};
