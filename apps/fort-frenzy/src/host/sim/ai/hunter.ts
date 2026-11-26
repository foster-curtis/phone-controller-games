// `hunter` AI (SPEC §9, §9.6, §15.5): the Stalker hunts players instead of the base. It picks the
// nearest targetable player (ties by slot) and follows that player's own flow field (one per hunted
// player, rebuilt when they move to a new tile), going straight at them once close. Its field
// prices tiles in range of the sentries and damage-dealing builds and inside hidden builds' trigger
// radii (ai/threat.ts, C3, RD10), so it slips round the defenses when it can. It stalks at normal
// speed until its quarry is within `hunt.lockRange`, then locks on (`huntSince`, the TV's flash) and
// sprints until the quarry changes. When its quarry goes down or dazed (§11.3), or another player
// comes clearly closer, it retargets; with nobody to hunt it walks the ground field and attacks the
// Citadel like a Grunt. Its bite winds up (it crouches low, then lunges).
import { dist, rectDist, rectNearest } from '../geometry';
import { state, type SimState } from '../internal';
import { BASE_ID, type EnemyEnt, type PlayerEnt, type SimCtx } from '../types';
import { fieldStep, knocked, windup } from './field';
import { swing, walkTo } from './path';

export function hunterAi(ctx: SimCtx, e: EnemyEnt): void {
  const s = state(ctx);
  const def = s.cat.enemy(e.kind);
  if (windup(s, e, def)) return;
  if (knocked(e)) return;
  const p = quarry(s, e);
  if (!p) {
    const speed = e.stats.moveSpeed;
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
  if (!e.locked && d <= def.hunt!.lockRange) {
    e.locked = true;
    e.huntSince = s.tick();
  }
  const speed = e.stats.moveSpeed * (e.locked ? def.hunt!.sprint : 1);
  if (d - e.r - p.r <= def.attack.range) {
    swing(s, e, def, p.id, p.x, p.y);
    e.ai = 'hunt';
    return;
  }
  e.target = p.id;
  // Close in, it runs straight at its quarry instead of following the field.
  const field = d <= def.hunt!.closeRange ? null : s.huntField(p.slot);
  if (!field) {
    walkTo(e, p.x, p.y, speed);
    return;
  }
  follow(s, e, field, speed, () => walkTo(e, p.x, p.y, speed));
}

/**
 * The current quarry: the nearest targetable player (ties by slot). It keeps its quarry until that
 * player is gone, down or dazed, or another comes clearly closer (`hunt.retargetTiles` of
 * hysteresis, so two players at similar range don't flip it back and forth). A new quarry ends the
 * lock-on.
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
  const keep = s.cat.enemy(e.kind).hunt!.retargetTiles;
  if (cur && best !== cur && bestD + keep >= dist(e.x, e.y, cur.x, cur.y)) best = cur;
  const slot = best ? best.slot : null;
  if (slot !== e.hunting) {
    e.hunting = slot;
    delete e.locked;
    delete e.huntSince;
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
}
