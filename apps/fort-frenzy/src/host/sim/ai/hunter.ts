// `hunter` AI (SPEC §9, §9.6, §15.5): the Stalker hunts players instead of the base. It picks the
// nearest targetable player (ties by slot) and follows that player's own flow field (one per hunted
// player, rebuilt when they move to a new tile), going straight at them once close. When its quarry
// goes down or dazed (§11.3), it retargets the same way; with nobody to hunt it walks the ground
// field and attacks the Citadel like a Grunt. A wall or tower blocking its field gets attacked. Its
// bite winds up (it crouches low, then lunges).
import { dist, rectDist, rectNearest, tileRect } from '../geometry';
import { state, type SimState } from '../internal';
import { BASE_ID, type EnemyEnt, type PlayerEnt, type SimCtx } from '../types';
import { fieldStep, knocked, windup } from './field';
import { swing, walkTo } from './path';

/** Within this distance (tiles) it runs straight at its quarry instead of following the field. */
const CLOSE = 1.5;

export function hunterAi(ctx: SimCtx, e: EnemyEnt): void {
  const s = state(ctx);
  const def = s.cat.enemy(e.kind);
  if (windup(s, e, def)) return;
  if (knocked(e)) return;
  const speed = e.stats.moveSpeed;
  const p = quarry(s, e);
  if (!p) {
    // Nobody to hunt: the base, like a path walker.
    e.ai = 'path';
    if (rectDist(e.x, e.y, s.baseRect) - e.r <= def.attack.range) {
      const n = rectNearest(e.x, e.y, s.baseRect);
      swing(s, e, def, BASE_ID, n.x, n.y);
      return;
    }
    e.target = null;
    follow(s, e, s.world.fields.ground, speed, () => {
      const n = rectNearest(e.x, e.y, s.baseRect);
      walkTo(e, n.x, n.y, speed);
    });
    return;
  }
  e.ai = 'hunt';
  const d = dist(e.x, e.y, p.x, p.y);
  if (d - e.r - p.r <= def.attack.range) {
    swing(s, e, def, p.id, p.x, p.y);
    e.ai = 'hunt';
    return;
  }
  e.target = p.id;
  const field = d <= CLOSE ? null : s.huntField(p.slot);
  if (!field) {
    walkTo(e, p.x, p.y, speed);
    return;
  }
  follow(s, e, field, speed, () => walkTo(e, p.x, p.y, speed));
}

/** The current quarry, retargeting when it's gone, down or dazed. */
function quarry(s: SimState, e: EnemyEnt): PlayerEnt | null {
  if (e.hunting !== null) {
    const p = s.player(e.hunting);
    if (p && s.targetable(p)) return p;
  }
  let best: PlayerEnt | null = null;
  let bestD = Infinity;
  for (const p of s.world.players) {
    if (!s.targetable(p)) continue;
    const d = dist(e.x, e.y, p.x, p.y);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  e.hunting = best ? best.slot : null;
  return best;
}

function follow(
  s: SimState,
  e: EnemyEnt,
  field: NonNullable<ReturnType<SimState['huntField']>>,
  speed: number,
  atGoal: () => void,
) {
  const step = fieldStep(s, e, field, speed);
  if (step.kind === 'goal') atGoal();
  else if (step.kind === 'blocked') {
    const def = s.cat.enemy(e.kind);
    if (rectDist(e.x, e.y, tileRect(step.col, step.row)) - e.r <= def.attack.range) {
      const keep = e.ai;
      swing(s, e, def, step.st.id, step.st.x, step.st.y);
      e.ai = keep;
    } else walkTo(e, step.st.x, step.st.y, speed);
  }
}
