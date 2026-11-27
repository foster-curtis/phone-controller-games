// NPC crowd (SPEC §6.10, §12.3 step 3): every citizen a mind drives (NPCs, and later takeover and
// walk-on characters, SPEC §6.18) thinks (state machine) and steers, in id order; citizens that walked
// off are removed with an `exit` event; then churn keeps the crowd within its band.
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are TF2's.
import { rebuildSpatial } from '../movement';
import type { StepContext } from '../systems';
import { steer, think } from './brain';
import { spawnNpc, stepChurn } from './churn';
import { createMind } from './mind';
import type { NpcApi } from './types';

export type { CrowdState, NpcApi, NpcLeg, NpcMoment, NpcNav } from './types';
export { chaseCoin, startLeaving } from './brain';
export { bandFor, crowdBand, liveNpcs } from './churn';
export { NPC_HOOKS, type NpcHooks } from './hooks';

export function step(ctx: StepContext): void {
  const { world } = ctx;
  rebuildSpatial(world);
  let gone: number[] | null = null;
  for (const c of world.characters) {
    if (c.control.k === 'player') continue;
    const rng = ctx.rng(`npc:${c.id}`);
    if (think(ctx, c, rng)) (gone ??= []).push(c.id);
    else steer(ctx, c, rng);
  }
  if (gone) {
    world.characters = world.characters.filter((c) => !gone.includes(c.id));
    for (const id of gone) ctx.emit({ ch: 'tv', e: 'exit', character: id });
    if (world.crowd) world.crowd.exited += gone.length;
  }
  stepChurn(ctx);
}

export const npc: NpcApi = {
  createMind,
  spawn: spawnNpc,
};
