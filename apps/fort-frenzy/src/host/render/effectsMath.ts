// Effect placement and speeds (C1 notes 9, 10): pure, so they are tested headless and shared with
// the content milestones. render/effects.ts draws them.
import { hash01 } from './fall';

/**
 * Straight-shot projectile speeds, tiles per second (C1 note 9; BUILD_PLAN §8 FF3-fix-1): the
 * content milestones (FF7 Ranger bolt, FF9 nanite bolts, FF10 Wasp shot) use these values for
 * `projectileSpeed`, so shots read as fast at TV distance. Arcing shells and boulders are timed by
 * their arcs instead.
 */
export const PROJECTILE_SPEEDS = { bolt: 26, 'nanite-bolt': 20, 'wasp-shot': 16 } as const;

/**
 * Heal glints and nanite motes over a body (C1 note 10): 3–5 points spread across and around it
 * (never one column), each with a small start delay. `x` is a fraction of the body height either
 * side of center, `y` a fraction of the height above the feet. Seeded, so it is stable per call.
 */
export function bodyBurstPoints(seed: number): { x: number; y: number; delayMs: number }[] {
  const r = (salt: string) => hash01(`body:${seed}:${salt}`);
  const n = 3 + Math.floor(r('n') * 3);
  // One point per lane across the body, in a shuffled order, so they never stack in a column.
  const lanes = Array.from({ length: n }, (_, i) => i).sort((a, b) => r(`o${a}`) - r(`o${b}`));
  return lanes.map((lane, i) => ({
    x: ((lane + 0.2 + 0.6 * r(`x${i}`)) / n - 0.5) * 0.7,
    y: 0.2 + 0.7 * r(`y${i}`),
    delayMs: Math.round(i * 70 + r(`d${i}`) * 50),
  }));
}
