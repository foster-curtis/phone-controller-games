// The Ranger's mines (SPEC §7.4): placed at his feet, one per full meter, up to `maxActive` (Minefield
// adds through `buildMax`; builds/core.ts removes the oldest). Live after `armMs`, a ground enemy's
// feet inside `triggerRadius` start the short delay, then the mine bursts: area damage and knockback
// to ground enemies' bodies (§9), and it's used up (core removes it after the build loop). Its damage
// carries the `build` tag, so it charges his super and never his meter (§7.2). Flyers pass over.
import type { BuildDef } from '../../../content/types';
import { circleHitsBody } from '../body';
import { num } from '../cards/common';
import type { SimState } from '../internal';
import type { BuildEnt, EnemyEnt } from '../types';
import type { BuildBehavior } from './index';

interface MineParams {
  triggerRadius: number;
  triggerMs: number;
  minTriggerMs: number;
  damage: number;
  knockback: number;
}

function params(def: BuildDef): MineParams {
  const { triggerRadius, triggerMs, damage, knockback } = def;
  if (
    triggerRadius === undefined ||
    triggerMs === undefined ||
    damage === undefined ||
    knockback === undefined
  )
    throw new Error(`build '${def.id}' is missing a mine param in content`);
  const minTriggerMs = num(def.module?.params, 'minTriggerMs');
  return { triggerRadius, triggerMs, minTriggerMs, damage, knockback };
}

/** The burst: `def.radius` (Shrapnel Charge) around the mine, ground enemies only. */
function burst(s: SimState, b: BuildEnt, def: BuildDef, m: MineParams): void {
  const owner = s.player(b.owner);
  const radius = owner ? s.attackStat(owner, def.radius, 'buildRadius', 'build') : def.radius;
  const amount = owner ? s.attackStat(owner, m.damage, 'damage', 'build') : m.damage;
  const knock = owner ? s.attackStat(owner, m.knockback, 'knockback', 'build') : m.knockback;
  // Velocity that travels `knock` tiles under the per-step decay (as the shockwave's).
  const v0 = knock * 60 * (1 - s.cat.rules.knockbackDecay);
  s.emit({ e: 'mineBurst', build: b.id });
  const reach = s.cat.bodyMax;
  const pad = radius + reach.r;
  const ids = s.world.spatial
    .queryBox(b.x - pad, b.y - pad, b.x + pad, b.y + radius + reach.reach, s.scratch)
    .slice();
  for (const id of ids) {
    if (s.kinds.get(id) !== 'enemy') continue;
    const e = s.units.get(id) as EnemyEnt;
    if (e.hp <= 0 || e.flying) continue;
    if (!circleHitsBody(b.x, b.y, radius, e.x, e.y, s.cat.body(e.kind))) continue;
    s.damage({
      source: owner?.id ?? null,
      target: e.id,
      amount,
      kind: 'area',
      tags: ['build', 'mine'],
    });
    if (v0 <= 0) continue;
    const dx = e.x - b.x;
    const dy = e.y - b.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    // An enemy dead on the mine goes straight down the screen, the same way for every replay.
    const ux = d < 1e-6 ? 0 : dx / d;
    const uy = d < 1e-6 ? 1 : dy / d;
    e.push = { x: (e.push?.x ?? 0) + ux * v0, y: (e.push?.y ?? 0) + uy * v0 };
  }
  b.charges = 0;
}

export const mine: BuildBehavior = {
  id: 'mine',
  check(def) {
    params(def);
  },
  combat(s: SimState, b: BuildEnt, def: BuildDef) {
    const m = params(def);
    const t = s.world.tick;
    if (b.triggerAt === null) {
      if (!s.nearestEnemy(b.x, b.y, m.triggerRadius, false)) return;
      const owner = s.player(b.owner);
      const ms = owner ? s.attackStat(owner, m.triggerMs, 'buildTriggerMs', 'build') : m.triggerMs;
      b.triggerAt = t + s.cat.steps(Math.max(m.minTriggerMs, ms));
      s.emit({ e: 'mineTrigger', build: b.id });
      return;
    }
    if (t >= b.triggerAt) burst(s, b, def, m);
  },
};
