// The Morale card's area (SPEC §6.1): allied knights and soldiers within `radius` of a point get the
// `morale` effect. Its `refresh` stacking keeps one effect however many areas reach a unit, so the
// Commander's area and his flag's never stack. Leaf module: types and geometry only.
import { dist } from '../geometry';
import type { SimState } from '../internal';
import type { EffectApply, EntityId } from '../types';

export function applyMorale(
  s: SimState,
  source: EntityId,
  x: number,
  y: number,
  radius: number,
  fx: EffectApply,
): void {
  for (const q of s.world.players)
    if (s.targetable(q) && dist(x, y, q.x, q.y) <= radius) s.applyEffect(q.id, fx, source);
  for (const u of s.world.soldiers)
    if (u.hp > 0 && !u.flight && dist(x, y, u.x, u.y) <= radius) s.applyEffect(u.id, fx, source);
}
