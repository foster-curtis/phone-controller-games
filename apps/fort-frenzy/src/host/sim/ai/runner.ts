// `runner` AI (SPEC §3.3, §9, §15.5): the Skitter follows the ground field at speed and never
// attacks players. On contact with the Citadel it bursts once and dies; a wall or tower blocking its
// field takes the burst instead (walls answer Runners, §9). A Runner that bursts pays no coins
// (only kills do, §9.1): it is marked as its own killer.
import { rectDist, tileRect } from '../geometry';
import { state, type SimState } from '../internal';
import { BASE_ID, type EnemyEnt, type SimCtx, type StructureEnt } from '../types';
import { fieldStep, knocked, toBase } from './field';

export function runnerAi(ctx: SimCtx, e: EnemyEnt): void {
  const s = state(ctx);
  const def = s.cat.enemy(e.kind);
  const reach = def.attack.range;
  if (rectDist(e.x, e.y, s.baseRect) - e.r <= reach) {
    burst(s, e, BASE_ID, def.vsStructure?.base ?? 1);
    return;
  }
  if (knocked(e)) return;
  e.ai = 'path';
  const step = fieldStep(s, e, s.world.fields.ground, e.stats.moveSpeed);
  if (step.kind === 'goal') toBase(s, e, e.stats.moveSpeed);
  else if (step.kind === 'blocked') {
    if (rectDist(e.x, e.y, tileRect(step.col, step.row)) - e.r <= reach) {
      burst(s, e, step.st.id, def.vsStructure?.[(step.st as StructureEnt).kind] ?? 1);
    } else {
      const dx = step.st.x - e.x;
      const dy = step.st.y - e.y;
      const l = Math.sqrt(dx * dx + dy * dy) || 1;
      e.vx = (dx / l) * e.stats.moveSpeed;
      e.vy = (dy / l) * e.stats.moveSpeed;
      e.facing = Math.atan2(dy, dx);
    }
  }
}

/** One burst at `target`, then the Runner is gone. */
function burst(s: SimState, e: EnemyEnt, target: number, mult: number) {
  const u = s.units.get(target);
  e.vx = e.vy = 0;
  e.target = target;
  if (u) e.facing = Math.atan2(u.y - e.y, u.x - e.x);
  s.emit({ e: 'attack', source: e.id, slot: 'attack', x: e.x, y: e.y, angle: e.facing });
  s.damage({
    source: e.id,
    target,
    amount: e.stats.damage * mult,
    kind: 'contact',
    tags: ['burst'],
  });
  e.hp = 0;
  s.killers.set(e.id, e.id);
}
