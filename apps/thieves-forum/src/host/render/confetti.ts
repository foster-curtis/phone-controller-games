// Round-end confetti (SPEC §6.14, §6.15; TF1-fix-1, user C1 note 9): the six delivered pieces, one
// frame each (`effects/confetti/piece-<n>.svg`), burst up and out, then fall like paper: drag caps
// the fall, each piece sways side to side, spins and flips (a squash on its own axis). Phaser-free,
// so tests step it headless; effects.ts draws the flakes. Choreography polish is TF20's.
import type { FrameKey } from './types';

export const CONFETTI_FRAMES = [
  'confetti/piece-1',
  'confetti/piece-2',
  'confetti/piece-3',
  'confetti/piece-4',
  'confetti/piece-5',
  'confetti/piece-6',
] as const satisfies readonly FrameKey[];

/** Build tuning (TF20 may retune). TF1 drew the whole six-piece sheet once at scale 1. */
export const CONFETTI = {
  /** Pieces per burst (TF1: 6, the one sheet). */
  count: 40,
  /** Piece scale on top of the character scale (TF1: 1). */
  scale: 0.6,
  /** Lifetime, ms. */
  ms: 3200,
  /** Burst speed, px/s: up and out. */
  speed: [160, 420] as const,
  /** Spread of the burst around straight up, radians each way. */
  spread: 1.2,
  /** Gravity, px/s². */
  gravity: 520,
  /** Linear drag, 1/s: paper reaches a slow terminal fall. */
  drag: 2.6,
  /** Sway amplitude, px/s, and frequency, Hz. */
  sway: [30, 70] as const,
  swayHz: [0.6, 1.4] as const,
  /** Spin, radians/s, either way. */
  spin: [2, 9] as const,
  /** Flip (a squash on the piece's own axis), Hz. */
  flipHz: [0.8, 2.4] as const,
} as const;

export interface Flake {
  frame: (typeof CONFETTI_FRAMES)[number];
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  sway: number;
  swayHz: number;
  flipHz: number;
  phase: number;
  age: number;
}

const between = (r: () => number, [a, b]: readonly [number, number]) => a + (b - a) * r();

/** A burst of flakes at a screen point (px). `rand` defaults to Math.random (render-only). */
export function confettiBurst(
  at: { x: number; y: number },
  count: number = CONFETTI.count,
  rand: () => number = Math.random,
): Flake[] {
  return Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (rand() * 2 - 1) * CONFETTI.spread;
    const v = between(rand, CONFETTI.speed);
    return {
      frame: CONFETTI_FRAMES[i % CONFETTI_FRAMES.length]!,
      x: at.x + (rand() - 0.5) * 16,
      y: at.y + (rand() - 0.5) * 8,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      rot: rand() * Math.PI * 2,
      spin: between(rand, CONFETTI.spin) * (rand() < 0.5 ? -1 : 1),
      sway: between(rand, CONFETTI.sway),
      swayHz: between(rand, CONFETTI.swayHz),
      flipHz: between(rand, CONFETTI.flipHz),
      phase: rand() * Math.PI * 2,
      age: 0,
    };
  });
}

/** Advances one flake by dt ms: gravity against drag, sway, spin. */
export function stepFlake(f: Flake, dtMs: number) {
  const dt = dtMs / 1000;
  f.age += dtMs;
  f.vy += CONFETTI.gravity * dt;
  const k = Math.exp(-CONFETTI.drag * dt);
  f.vx *= k;
  f.vy *= k;
  const sway = f.sway * Math.sin((f.age / 1000) * f.swayHz * Math.PI * 2 + f.phase);
  f.x += (f.vx + sway) * dt;
  f.y += f.vy * dt;
  // Paper tilts into its sway and spins.
  f.rot += f.spin * dt;
}

/** The flip: the piece's width as it turns over (never quite edge-on, so it never vanishes). */
export function flakeFlip(f: Flake): number {
  const c = Math.cos((f.age / 1000) * f.flipHz * Math.PI * 2 + f.phase);
  return Math.sign(c || 1) * Math.max(0.15, Math.abs(c));
}
