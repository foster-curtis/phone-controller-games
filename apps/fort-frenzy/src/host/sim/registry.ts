// Sim module registry (SPEC §15.3): passives, card behaviors, effects, boss behaviors, AI kinds and
// structure behaviors, by id. Content refers to modules with `ModuleRef`.
// Append-only registry (BUILD_PLAN §3): add entries, never rename or delete one.
// Registered behaviors import only types, `internal.ts`, `geometry.ts` and `stats.ts`, never this file,
// so the registry has no import cycles.
import type { EnemyDef } from '../../content/types';
import type { EffectId, StructureId } from '../../shared/ids';
import { bruteAi } from './ai/brute';
import { colossus } from './boss/colossus';
import { state } from './internal';
import { flyerAi } from './ai/flyer';
import { hunterAi } from './ai/hunter';
import { pathAi } from './ai/path';
import { runnerAi } from './ai/runner';
import { siegeAi } from './ai/siege';
import { swarmAi } from './ai/swarm';
import { mason, stunEffect } from './classes/warden';
import { steadyAim } from './modules/steadyAim';
import { fieldMedic } from './modules/fieldMedic';
import { leadFromTheFront } from './modules/leadFromTheFront';
import { haste, leadAura, morale, towerDefense } from './modules/supportEffects';
import { mortarTick } from './structures/mortar';
import { slowEffect, snareTick } from './structures/snare';
import { turretTick } from './structures/turret';
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
export const modules: Record<string, ModuleDef> = {
  steady_aim: steadyAim, // FF6
  field_medic: fieldMedic, // FF9
  lead_from_the_front: leadFromTheFront, // FF9
  mason: mason, // FF8
};

/** Status effect definitions (§15.3). */
export const effects: Partial<Record<EffectId, EffectDef>> = {
  morale, // FF9
  haste, // FF9
  tower_defense: towerDefense, // FF9
  aura_lead_from_the_front: leadAura, // FF9
  slow: slowEffect, // FF8
  stun: stunEffect, // FF8
};

/** Boss behaviors, by id ('colossus'). */
export const bosses: Record<string, BossBehavior> = {
  colossus: colossus, // FF11
};

/** `boss` AI (FF11): the enemy's boss module (content `boss.module`) runs it each step. */
function bossAi(ctx: SimCtx, e: EnemyEnt): void {
  const ref = state(ctx).cat.enemy(e.kind).boss;
  if (ref) bosses[ref.module]?.tick(ctx, e);
}

/** One enemy's AI for a step (§15.5 behavior per `ai`). */
export type AiTick = (ctx: SimCtx, enemy: EnemyEnt) => void;
export const aiKinds: Partial<Record<EnemyDef['ai'], AiTick>> = {
  path: pathAi, // FF6
  runner: runnerAi, // FF10
  swarm: swarmAi, // FF10
  brute: bruteAi, // FF10
  flyer: flyerAi, // FF10
  siege: siegeAi, // FF10
  hunter: hunterAi, // FF10
  boss: bossAi, // FF11
};

/** One structure's behavior for a step (attacks, snare discharges, Fortify). */
export type StructureTick = (ctx: SimCtx, structure: StructureEnt) => void;
export const structureBehaviors: Partial<Record<StructureId, StructureTick>> = {
  arrow_tower: turretTick, // FF6
  bomb_tower: mortarTick, // FF8
  snare: snareTick, // FF8
};
