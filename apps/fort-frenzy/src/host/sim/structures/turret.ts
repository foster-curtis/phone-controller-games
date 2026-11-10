// Arrow tower (neon knights: pulse turret, SPEC §8): long range, single target, hits Flyers. Fires at
// the nearest enemy in range whenever its cooldown allows.
import { bodyAimY } from '../body';
import { state } from '../internal';
import type { SimCtx, StructureEnt } from '../types';

export function turretTick(ctx: SimCtx, st: StructureEnt): void {
  const s = state(ctx);
  const a = st.attack;
  const atk = s.cat.structure(st.kind).attack;
  if (!a || !atk) return;
  const t = s.tick();
  if (t < a.readyAt) return;
  const range = s.attackStat(st, atk.range, 'range');
  const target = s.nearestEnemy(st.x, st.y, range, atk.hitsFlyers);
  if (!target) return;
  // At its body (a Wasp's flies over its shadow, C4).
  const dx = target.x - st.x;
  const dy = bodyAimY(target.y, s.cat.body(target.kind)) - st.y;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  st.facing = Math.atan2(dy, dx);
  const speedUp = Math.max(0.05, s.attackStat(st, 1, 'attackSpeed'));
  a.readyAt = t + s.cat.steps(atk.cooldownMs / speedUp);
  s.emit({ e: 'attack', source: st.id, slot: 'attack', x: st.x, y: st.y, angle: st.facing });
  s.fire({
    source: st,
    from: st.kind,
    slot: 'attack',
    side: 'ours',
    x: st.x,
    y: st.y,
    dx: dx / l,
    dy: dy / l,
    attack: atk,
    damage: s.attackStat(st, atk.damage, 'damage'),
    range: range + target.r,
    speed: s.attackStat(st, atk.speed!, 'projectileSpeed'),
    kind: 'ranged',
    tags: [],
    effects: [],
    pierce: 0,
  });
}
