// `hunter` AI (SPEC §9, §9.6, §15.5): the Stalker hunts players instead of the base. It picks the
// nearest targetable player (ties by slot) and follows that player's own flow field (one per hunted
// player, rebuilt when they move to a new tile), going straight at them once close. Its field
// prices tiles in tower and sentry range (ai/threat.ts, C3), so it slips round the defenses when it
// can. When its quarry goes down or dazed (§11.3), or another player comes clearly closer, it
// retargets; with nobody to hunt it walks the ground field and attacks the Citadel like a Grunt. A
// wall or tower blocking its field gets attacked. Its bite winds up (it crouches low, then lunges).
import { dist, rectDist, rectNearest, tileRect } from '../geometry';
import { state, type SimState } from '../internal';
import { BASE_ID, type EnemyEnt, type PlayerEnt, type SimCtx } from '../types';
import { fieldStep, knocked, windup } from './field';
import { swing, walkTo } from './path';

/** Within this distance (tiles) it runs straight at its quarry instead of following the field. */
const CLOSE = 1.5;
/** Another player must be this much closer (tiles) than its quarry to take over (C3, FF10-fix-1). */
export const RETARGET_TILES = 2;

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

/**
 * The current quarry: the nearest targetable player (ties by slot). It keeps its quarry until that
 * player is gone, down or dazed, or another comes clearly closer (`RETARGET_TILES` of hysteresis, so
 * two players at similar range don't flip it back and forth). Each new quarry stamps `huntSince`.
 */
function quarry(s: SimState, e: EnemyEnt): PlayerEnt | null {
  let cur: PlayerEnt | null = null;
  if (e.hunting !== null) {
    const p = s.player(e.hunting);
    if (p && s.targetable(p)) cur = p;
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
  if (cur && best !== cur && bestD + RETARGET_TILES >= dist(e.x, e.y, cur.x, cur.y)) best = cur;
  const slot = best ? best.slot : null;
  if (slot !== e.hunting) {
    e.hunting = slot;
    if (slot === null) delete e.huntSince;
    else e.huntSince = s.tick();
  }
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
