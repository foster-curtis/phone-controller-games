// `brute` AI (SPEC §9, §15.5; RD10): the Brute is a build hunter. It goes for the nearest targetable
// build at any distance on a ground field toward that build's tile; a build placed nearer pulls it
// off course. With none on the map it behaves like a Grunt (`pathAi`: the base, knights in its aggro
// leash). Each new build it picks stamps `huntSince`, the TV's lock-on cue.
import { buildTargetable } from '../builds/core';
import { dist } from '../geometry';
import { state, type SimState } from '../internal';
import type { BuildEnt, EnemyEnt, SimCtx } from '../types';
import { fieldStep, knocked, windup } from './field';
import { pathAi, swing, walkTo } from './path';

export function bruteAi(ctx: SimCtx, e: EnemyEnt): void {
  const s = state(ctx);
  const def = s.cat.enemy(e.kind);
  if (windup(s, e, def)) return;
  if (knocked(e)) return;
  const b = nearestBuild(s, e);
  if (!b) {
    if (e.huntBuild !== undefined) {
      delete e.huntBuild;
      delete e.huntSince;
      e.ai = 'path';
      e.target = null;
    }
    pathAi(ctx, e);
    return;
  }
  if (b.id !== e.huntBuild) {
    e.huntBuild = b.id;
    e.huntSince = s.tick();
  }
  e.leashFrom = null;
  e.ai = 'hunt';
  if (dist(e.x, e.y, b.x, b.y) - e.r - b.r <= def.attack.range) {
    swing(s, e, def, b.id, b.x, b.y);
    e.ai = 'hunt';
    return;
  }
  e.target = b.id;
  const speed = e.stats.moveSpeed;
  if (fieldStep(s, e, s.bruteField(b), speed).kind === 'goal') walkTo(e, b.x, b.y, speed);
}

/** The nearest targetable build by distance to its edge (ties to the earlier build). */
function nearestBuild(s: SimState, e: EnemyEnt): BuildEnt | null {
  let best: BuildEnt | null = null;
  let bestD = Infinity;
  for (const b of s.world.builds) {
    if (!buildTargetable(b)) continue;
    const d = dist(e.x, e.y, b.x, b.y) - b.r;
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}
