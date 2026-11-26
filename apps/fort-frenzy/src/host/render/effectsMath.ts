// Effect placement and speeds (C1 notes 9, 10): pure, so they are tested headless and shared with
// the content milestones. render/effects.ts draws them.
import { base, flyer, artificer } from '../../content/balance';
import { hash01 } from './fall';

/**
 * Straight-shot projectile speeds, tiles per second (C1 note 9; BUILD_PLAN §8 FF3-fix-1): the
 * values come from the balance sheet (0fbe288), so shots read as fast at TV distance. Arcing shells and boulders are timed by
 * their arcs instead.
 */
export const PROJECTILE_SPEEDS = {
  // The `bolt` look is shared: the Ranger's longbow (22 t/s) is slower than the sentries'
  // (26); the in-game shot is drawn at the speed the sim projectile carries, this is the gallery's pace.
  bolt: base.archers.attack.speed,
  'nanite-bolt': artificer.main.speed,
  'wasp-shot': flyer.attack.speed,
};

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

/**
 * The portal flare's flicker (RD5-fix-2, SPEC §9.6): irregular alpha dips and a slight scale jitter
 * over the flare's life, on top of its fade in and out. Three incommensurate waves (cycles per
 * life) sum to an uneven pattern; the phases come from the seed, so one flare always flickers the
 * same way. The envelope is strongest at the start and settles as the group arrives. Only alpha and
 * scale change per frame. All tuning for it lives here.
 */
export const FLARE_FLICKER = {
  /** Wave frequencies, cycles over the flare's life (not multiples of each other). */
  cycles: [5.3, 8.7, 13.1] as const,
  /** Deepest dip at full strength: alpha never goes below this (readable across the room). */
  minAlpha: 0.4,
  /** Scale swing at full strength, as a fraction (±). */
  scaleSwing: 0.07,
  /** Envelope at the start and the end of the life (linear between). */
  envStart: 1,
  envEnd: 0.35,
} as const;

/** `alpha` multiplies the flare's fade, `scale` its size. Both are pure in (`u`, `seed`). */
export function flareFlicker(u: number, seed: string): { alpha: number; scale: number } {
  const F = FLARE_FLICKER;
  const env = F.envStart + (F.envEnd - F.envStart) * Math.min(1, Math.max(0, u));
  let n = 0;
  for (let i = 0; i < F.cycles.length; i++)
    n += Math.sin((u * F.cycles[i]! + hash01(`flare:${seed}:${i}`)) * Math.PI * 2);
  n /= F.cycles.length; // -1..1
  const dip = 0.5 * (1 + n); // 0..1
  return { alpha: 1 - (1 - F.minAlpha) * dip * env, scale: 1 + F.scaleSwing * n * env };
}
