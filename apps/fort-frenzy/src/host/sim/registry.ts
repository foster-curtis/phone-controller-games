// Sim module registry (SPEC §15.3): passives, card behaviors, effects, boss behaviors, AI kinds and
// structure behaviors, by id. Content refers to modules with `ModuleRef`.
// Append-only registry (BUILD_PLAN §3): add entries, never rename or delete one.
import type { EnemyDef } from '../../content/types';
import type { EffectId, StructureId } from '../../shared/ids';
import type {
  BossBehavior,
  EffectDef,
  EnemyEnt,
  Modifier,
  ModuleDef,
  SimCtx,
  StructureEnt,
} from './types';

/** Defines a module built from config params. */
export function defineModule<P>(id: string, make: (params: P) => Modifier): ModuleDef<P> {
  return { id, make };
}

/** Passive, card and shop modules, by module id. */
export const modules: Record<string, ModuleDef> = {};

/** Status effect definitions (§15.3). */
export const effects: Partial<Record<EffectId, EffectDef>> = {};

/** Boss behaviors, by id ('colossus'). */
export const bosses: Record<string, BossBehavior> = {};

/** One enemy's AI for a step (§15.5 behavior per `ai`). */
export type AiTick = (ctx: SimCtx, enemy: EnemyEnt) => void;
export const aiKinds: Partial<Record<EnemyDef['ai'], AiTick>> = {};

/** One structure's behavior for a step (attacks, snare discharges, Fortify). */
export type StructureTick = (ctx: SimCtx, structure: StructureEnt) => void;
export const structureBehaviors: Partial<Record<StructureId, StructureTick>> = {};
