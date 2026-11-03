// Render interpolation (SPEC §8): draw at lerp(prev, curr, alpha). Entities only in `curr` (just
// spawned) render at `curr`; entities only in `prev` (just removed) are dropped.
import { lerp, lerpAngle } from '@pcg/game-kit';
import type { EggState, GhostState, SimSnapshot } from './sim/types';

function byId<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  return new Map(list.map((e) => [e.id, e]));
}

/** Positions, angles and the arena radius are interpolated; flags and meters come from `curr`. */
export function interpolateSnapshot(
  prev: SimSnapshot,
  curr: SimSnapshot,
  alpha: number,
): SimSnapshot {
  const prevEggs = byId(prev.eggs);
  const prevGhosts = byId(prev.ghosts);
  return {
    ...curr,
    arena: { ...curr.arena, radius: lerp(prev.arena.radius, curr.arena.radius, alpha) },
    eggs: curr.eggs.map((e): EggState => {
      const p = prevEggs.get(e.id);
      if (!p) return { ...e };
      return {
        ...e,
        x: lerp(p.x, e.x, alpha),
        y: lerp(p.y, e.y, alpha),
        angle: lerpAngle(p.angle, e.angle, alpha),
      };
    }),
    ghosts: curr.ghosts.map((g): GhostState => {
      const p = prevGhosts.get(g.id);
      if (!p) return { ...g };
      return { ...g, x: lerp(p.x, g.x, alpha), y: lerp(p.y, g.y, alpha) };
    }),
  };
}
