// `flyer` AI (SPEC §9, §15.5): the Wasp drone ignores flow fields and walls and flies straight at the
// Citadel; it takes the aggro leash like Grunts (chases a player in its aggro radius up to the leash,
// then flies back to where it left its way). It hovers in range and shoots its stinger cannon: a
// short wind-up (the muzzle charges), then a straight shot at where the target is. Shots hit players,
// soldiers and the Citadel (combat.ts), never structures (it flies over them).
import { dist, rectDist, rectNearest } from '../geometry';
import { state, type SimState } from '../internal';
import { BASE_ID, type EnemyEnt, type PlayerEnt, type SimCtx } from '../types';
import { knocked } from './field';
import { leash, walkTo } from './path';

/** A shot flies a little past its target so a moving player can still step into it. */
const SHOT_SLACK = 1;

export function flyerAi(ctx: SimCtx, e: EnemyEnt): void {
  const s = state(ctx);
  const def = s.cat.enemy(e.kind);
  const range = def.attack.range;
  if (e.attack.windupEndsAt !== null) {
    const u = e.target === null ? undefined : s.units.get(e.target);
    const lost =
      u === undefined ||
      u.hp <= 0 ||
      (s.kinds.get(u.id) === 'player' && !s.targetable(u as PlayerEnt));
    if (lost) e.attack.windupEndsAt = null;
    else {
      e.vx = e.vy = 0;
      if (s.tick() >= e.attack.windupEndsAt) {
        e.attack.windupEndsAt = null;
        shoot(s, e, e.target!);
      }
      return;
    }
  }
  if (knocked(e)) return;
  if (def.aggro) leash(s, e, def.aggro);
  const speed = e.stats.moveSpeed;
  if (e.ai === 'aggro') {
    const p = s.units.get(e.target!) as PlayerEnt;
    if (dist(e.x, e.y, p.x, p.y) - p.r <= range) aim(s, e, p.id, p.x, p.y);
    else walkTo(e, p.x, p.y, speed);
    return;
  }
  if (e.ai === 'return') {
    walkTo(e, e.leashFrom!.x, e.leashFrom!.y, speed);
    return;
  }
  const n = rectNearest(e.x, e.y, s.baseRect);
  if (rectDist(e.x, e.y, s.baseRect) <= range) {
    aim(s, e, BASE_ID, n.x, n.y);
    e.ai = 'attack';
    return;
  }
  e.ai = 'path';
  e.target = null;
  walkTo(e, n.x, n.y, speed);
}

/** Hover and start a wind-up at `target` once the cooldown allows. */
function aim(s: SimState, e: EnemyEnt, target: number, tx: number, ty: number) {
  e.vx = e.vy = 0;
  e.target = target;
  e.facing = Math.atan2(ty - e.y, tx - e.x);
  const t = s.tick();
  if (t < e.attack.readyAt) return;
  const a = s.cat.enemy(e.kind).attack;
  e.attack.readyAt = t + s.cat.steps(a.cooldownMs / Math.max(0.05, e.stats.attackSpeed || 1));
  s.emit({ e: 'attack', source: e.id, slot: 'attack', x: e.x, y: e.y, angle: e.facing });
  const wind = a.windupMs ? s.cat.steps(a.windupMs) : 0;
  if (wind > 0) e.attack.windupEndsAt = t + wind;
  else shoot(s, e, target);
}

/** The stinger shot: straight at where the target is now. */
function shoot(s: SimState, e: EnemyEnt, target: number) {
  const u = s.units.get(target);
  if (!u) return;
  const def = s.cat.enemy(e.kind);
  const at = target === BASE_ID ? rectNearest(e.x, e.y, s.baseRect) : { x: u.x, y: u.y };
  const dx = at.x - e.x;
  const dy = at.y - e.y;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  e.facing = Math.atan2(dy, dx);
  s.fire({
    source: e,
    from: e.kind,
    slot: 'attack',
    side: 'theirs',
    x: e.x,
    y: e.y,
    dx: dx / l,
    dy: dy / l,
    attack: def.attack,
    damage: e.stats.damage,
    range: l + SHOT_SLACK,
    speed: def.attack.speed ?? 16,
    kind: 'ranged',
    tags: [],
    effects: [],
    pierce: 0,
  });
}
