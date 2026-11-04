// `swarm` AI (SPEC §9, §9.6, §15.3): each Scrap mite is a path walker with the aggro leash, plus its
// own jitter in the sim (the `combat:<wave>` stream), so hitboxes match the art: a sideways drift and
// a pace that re-roll every fraction of a second, with short random stops. Mites never turn back:
// the drift is sideways to the field's direction only. The numbers are content (`EnemyDef.jitter`).
import { state } from '../internal';
import type { EnemyEnt, SimCtx } from '../types';
import { pathAi } from './path';

export function swarmAi(ctx: SimCtx, e: EnemyEnt): void {
  const s = state(ctx);
  pathAi(ctx, e);
  if (e.ai !== 'path' || e.attack.windupEndsAt !== null) return;
  const t = s.tick();
  if (!e.wander || t >= e.wander.until) {
    const j = s.cat.enemy(e.kind).jitter!;
    const rng = s.rng(`combat:${s.world.wave}`);
    const stop = rng.next() < j.stopChance;
    const [lo, hi] = stop ? j.stopMs : j.rollMs;
    e.wander = {
      side: stop ? 0 : (rng.next() * 2 - 1) * j.drift,
      pace: stop ? 0 : j.pace + rng.next() * j.paceRange,
      until: t + rng.int(s.cat.steps(lo), s.cat.steps(hi)),
    };
  }
  const v = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
  if (v < 1e-6) return;
  const fx = e.vx / v;
  const fy = e.vy / v;
  // Forward plus a sideways drift (perpendicular, so never backward), at this mite's pace.
  let dx = fx - fy * e.wander.side;
  let dy = fy + fx * e.wander.side;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= l;
  dy /= l;
  const speed = v * e.wander.pace;
  e.vx = dx * speed;
  e.vy = dy * speed;
  if (speed > 0) e.facing = Math.atan2(fy, fx);
}
